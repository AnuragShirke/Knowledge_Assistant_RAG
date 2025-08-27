"""
Data backup and persistence utilities for the Knowledge Assistant RAG application.
Provides automated backup, restore, and data persistence verification capabilities.
"""

import os
import shutil
import json
import sqlite3
import asyncio
import logging
import zipfile
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from .database import User, DocumentMetadata, get_async_session, engine
from .vector_store import get_qdrant_client

logger = logging.getLogger(__name__)


@dataclass
class BackupMetadata:
    """Backup metadata information"""
    backup_id: str
    timestamp: datetime
    backup_type: str  # 'full', 'incremental', 'database_only', 'vectors_only'
    file_path: str
    file_size_bytes: int
    checksum: str
    database_records: int
    vector_collections: List[str]
    status: str  # 'completed', 'failed', 'in_progress'
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result


class BackupManager:
    """Comprehensive backup and restore manager"""
    
    def __init__(self, backup_dir: str = "backups"):
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        self.database_path = "knowledge_assistant.db"
        self.max_backups = 10  # Keep last 10 backups
        
    def _generate_backup_id(self) -> str:
        """Generate unique backup ID"""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"backup_{timestamp}"
    
    def _calculate_file_checksum(self, file_path: str) -> str:
        """Calculate SHA-256 checksum of a file"""
        hash_sha256 = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate checksum for {file_path}: {str(e)}")
            return ""
    
    async def backup_database(self, backup_id: str, backup_dir: Path) -> Tuple[str, int]:
        """Backup SQLite database"""
        try:
            db_backup_path = backup_dir / "database.db"
            
            # Use SQLite backup API for consistent backup
            if os.path.exists(self.database_path):
                # Create a connection to source database
                source_conn = sqlite3.connect(self.database_path)
                
                # Create backup database
                backup_conn = sqlite3.connect(str(db_backup_path))
                
                # Perform backup
                source_conn.backup(backup_conn)
                
                # Close connections
                backup_conn.close()
                source_conn.close()
                
                # Get record counts
                conn = sqlite3.connect(str(db_backup_path))
                cursor = conn.cursor()
                
                cursor.execute("SELECT COUNT(*) FROM users")
                user_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM documents")
                doc_count = cursor.fetchone()[0]
                
                conn.close()
                
                total_records = user_count + doc_count
                logger.info(f"Database backup completed: {total_records} records")
                
                return str(db_backup_path), total_records
            else:
                logger.warning(f"Database file not found: {self.database_path}")
                return "", 0
                
        except Exception as e:
            logger.error(f"Database backup failed: {str(e)}")
            raise
    
    async def backup_qdrant_collections(self, backup_id: str, backup_dir: Path) -> List[str]:
        """Backup Qdrant vector collections"""
        try:
            client = get_qdrant_client()
            collections_info = client.get_collections()
            backed_up_collections = []
            
            vectors_dir = backup_dir / "vectors"
            vectors_dir.mkdir(exist_ok=True)
            
            for collection in collections_info.collections:
                collection_name = collection.name
                
                try:
                    # Get collection info
                    collection_info = client.get_collection(collection_name)
                    
                    # Export collection data
                    # Note: This is a simplified approach. In production, you might want to use
                    # Qdrant's snapshot functionality or export/import APIs
                    
                    # Get all points (this might be memory intensive for large collections)
                    points, _ = client.scroll(
                        collection_name=collection_name,
                        limit=10000,  # Adjust based on your needs
                        with_payload=True,
                        with_vectors=True
                    )
                    
                    # Save collection metadata and points
                    collection_backup = {
                        "collection_info": {
                            "name": collection_name,
                            "config": collection_info.config.dict() if hasattr(collection_info, 'config') else {},
                            "points_count": len(points)
                        },
                        "points": []
                    }
                    
                    # Convert points to serializable format
                    for point in points:
                        point_data = {
                            "id": str(point.id),
                            "vector": point.vector.tolist() if hasattr(point.vector, 'tolist') else point.vector,
                            "payload": point.payload
                        }
                        collection_backup["points"].append(point_data)
                    
                    # Save to file
                    collection_file = vectors_dir / f"{collection_name}.json"
                    with open(collection_file, 'w') as f:
                        json.dump(collection_backup, f, indent=2)
                    
                    backed_up_collections.append(collection_name)
                    logger.info(f"Backed up collection '{collection_name}' with {len(points)} points")
                    
                except Exception as e:
                    logger.error(f"Failed to backup collection '{collection_name}': {str(e)}")
                    continue
            
            return backed_up_collections
            
        except Exception as e:
            logger.error(f"Qdrant backup failed: {str(e)}")
            return []
    
    async def create_full_backup(self) -> BackupMetadata:
        """Create a full backup of database and vector collections"""
        backup_id = self._generate_backup_id()
        backup_start = datetime.utcnow()
        
        logger.info(f"Starting full backup: {backup_id}")
        
        try:
            # Create backup directory
            backup_dir = self.backup_dir / backup_id
            backup_dir.mkdir(exist_ok=True)
            
            # Backup database
            db_path, db_records = await self.backup_database(backup_id, backup_dir)
            
            # Backup vector collections
            vector_collections = await self.backup_qdrant_collections(backup_id, backup_dir)
            
            # Create backup metadata
            metadata = {
                "backup_id": backup_id,
                "timestamp": backup_start.isoformat(),
                "backup_type": "full",
                "database_records": db_records,
                "vector_collections": vector_collections,
                "status": "completed"
            }
            
            # Save metadata
            metadata_file = backup_dir / "metadata.json"
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            # Create compressed archive
            archive_path = self.backup_dir / f"{backup_id}.zip"
            with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in backup_dir.rglob('*'):
                    if file_path.is_file():
                        arcname = file_path.relative_to(backup_dir)
                        zipf.write(file_path, arcname)
            
            # Remove temporary directory
            shutil.rmtree(backup_dir)
            
            # Calculate final metadata
            file_size = archive_path.stat().st_size
            checksum = self._calculate_file_checksum(str(archive_path))
            
            backup_metadata = BackupMetadata(
                backup_id=backup_id,
                timestamp=backup_start,
                backup_type="full",
                file_path=str(archive_path),
                file_size_bytes=file_size,
                checksum=checksum,
                database_records=db_records,
                vector_collections=vector_collections,
                status="completed"
            )
            
            # Save backup registry
            await self._update_backup_registry(backup_metadata)
            
            logger.info(f"Full backup completed: {backup_id} ({file_size} bytes)")
            return backup_metadata
            
        except Exception as e:
            logger.error(f"Full backup failed: {str(e)}")
            
            # Clean up on failure
            backup_dir = self.backup_dir / backup_id
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            
            archive_path = self.backup_dir / f"{backup_id}.zip"
            if archive_path.exists():
                archive_path.unlink()
            
            return BackupMetadata(
                backup_id=backup_id,
                timestamp=backup_start,
                backup_type="full",
                file_path="",
                file_size_bytes=0,
                checksum="",
                database_records=0,
                vector_collections=[],
                status="failed",
                error_message=str(e)
            )
    
    async def restore_from_backup(self, backup_id: str) -> bool:
        """Restore data from a backup"""
        try:
            logger.info(f"Starting restore from backup: {backup_id}")
            
            # Find backup file
            archive_path = self.backup_dir / f"{backup_id}.zip"
            if not archive_path.exists():
                raise FileNotFoundError(f"Backup file not found: {archive_path}")
            
            # Create temporary restore directory
            restore_dir = self.backup_dir / f"restore_{backup_id}"
            restore_dir.mkdir(exist_ok=True)
            
            try:
                # Extract backup
                with zipfile.ZipFile(archive_path, 'r') as zipf:
                    zipf.extractall(restore_dir)
                
                # Read metadata
                metadata_file = restore_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                    logger.info(f"Restoring backup from {metadata['timestamp']}")
                
                # Restore database
                db_backup_path = restore_dir / "database.db"
                if db_backup_path.exists():
                    # Backup current database
                    if os.path.exists(self.database_path):
                        backup_current = f"{self.database_path}.backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                        shutil.copy2(self.database_path, backup_current)
                        logger.info(f"Current database backed up to: {backup_current}")
                    
                    # Restore database
                    shutil.copy2(db_backup_path, self.database_path)
                    logger.info("Database restored successfully")
                
                # Restore vector collections
                vectors_dir = restore_dir / "vectors"
                if vectors_dir.exists():
                    await self._restore_qdrant_collections(vectors_dir)
                
                logger.info(f"Restore completed successfully: {backup_id}")
                return True
                
            finally:
                # Clean up temporary directory
                if restore_dir.exists():
                    shutil.rmtree(restore_dir)
            
        except Exception as e:
            logger.error(f"Restore failed: {str(e)}")
            return False
    
    async def _restore_qdrant_collections(self, vectors_dir: Path):
        """Restore Qdrant collections from backup"""
        try:
            client = get_qdrant_client()
            
            for collection_file in vectors_dir.glob("*.json"):
                collection_name = collection_file.stem
                
                try:
                    with open(collection_file, 'r') as f:
                        collection_backup = json.load(f)
                    
                    collection_info = collection_backup["collection_info"]
                    points_data = collection_backup["points"]
                    
                    # Recreate collection (this will delete existing data)
                    try:
                        client.delete_collection(collection_name)
                    except:
                        pass  # Collection might not exist
                    
                    # Create collection with original configuration
                    # Note: This is simplified - you might need to handle different vector configurations
                    from qdrant_client.models import Distance, VectorParams
                    
                    # Determine vector size from first point
                    vector_size = len(points_data[0]["vector"]) if points_data else 384
                    
                    client.create_collection(
                        collection_name=collection_name,
                        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
                    )
                    
                    # Restore points in batches
                    batch_size = 100
                    for i in range(0, len(points_data), batch_size):
                        batch = points_data[i:i + batch_size]
                        
                        points = []
                        for point_data in batch:
                            from qdrant_client.models import PointStruct
                            point = PointStruct(
                                id=point_data["id"],
                                vector=point_data["vector"],
                                payload=point_data["payload"]
                            )
                            points.append(point)
                        
                        client.upsert(collection_name=collection_name, points=points)
                    
                    logger.info(f"Restored collection '{collection_name}' with {len(points_data)} points")
                    
                except Exception as e:
                    logger.error(f"Failed to restore collection '{collection_name}': {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"Vector collections restore failed: {str(e)}")
    
    async def _update_backup_registry(self, backup_metadata: BackupMetadata):
        """Update backup registry with new backup information"""
        registry_file = self.backup_dir / "backup_registry.json"
        
        try:
            # Load existing registry
            if registry_file.exists():
                with open(registry_file, 'r') as f:
                    registry = json.load(f)
            else:
                registry = {"backups": []}
            
            # Add new backup
            registry["backups"].append(backup_metadata.to_dict())
            
            # Sort by timestamp (newest first)
            registry["backups"].sort(key=lambda x: x["timestamp"], reverse=True)
            
            # Keep only the most recent backups
            registry["backups"] = registry["backups"][:self.max_backups]
            
            # Save registry
            with open(registry_file, 'w') as f:
                json.dump(registry, f, indent=2)
            
        except Exception as e:
            logger.error(f"Failed to update backup registry: {str(e)}")
    
    async def list_backups(self) -> List[BackupMetadata]:
        """List all available backups"""
        registry_file = self.backup_dir / "backup_registry.json"
        
        try:
            if registry_file.exists():
                with open(registry_file, 'r') as f:
                    registry = json.load(f)
                
                backups = []
                for backup_data in registry.get("backups", []):
                    backup_metadata = BackupMetadata(
                        backup_id=backup_data["backup_id"],
                        timestamp=datetime.fromisoformat(backup_data["timestamp"]),
                        backup_type=backup_data["backup_type"],
                        file_path=backup_data["file_path"],
                        file_size_bytes=backup_data["file_size_bytes"],
                        checksum=backup_data["checksum"],
                        database_records=backup_data["database_records"],
                        vector_collections=backup_data["vector_collections"],
                        status=backup_data["status"],
                        error_message=backup_data.get("error_message")
                    )
                    backups.append(backup_metadata)
                
                return backups
            else:
                return []
                
        except Exception as e:
            logger.error(f"Failed to list backups: {str(e)}")
            return []
    
    async def cleanup_old_backups(self, keep_count: int = None):
        """Clean up old backup files"""
        if keep_count is None:
            keep_count = self.max_backups
        
        try:
            backups = await self.list_backups()
            
            # Sort by timestamp (newest first)
            backups.sort(key=lambda x: x.timestamp, reverse=True)
            
            # Remove old backups
            for backup in backups[keep_count:]:
                try:
                    if os.path.exists(backup.file_path):
                        os.remove(backup.file_path)
                        logger.info(f"Removed old backup: {backup.backup_id}")
                except Exception as e:
                    logger.error(f"Failed to remove backup {backup.backup_id}: {str(e)}")
            
            # Update registry
            kept_backups = backups[:keep_count]
            registry = {"backups": [backup.to_dict() for backup in kept_backups]}
            
            registry_file = self.backup_dir / "backup_registry.json"
            with open(registry_file, 'w') as f:
                json.dump(registry, f, indent=2)
            
        except Exception as e:
            logger.error(f"Backup cleanup failed: {str(e)}")
    
    async def verify_backup_integrity(self, backup_id: str) -> bool:
        """Verify backup file integrity"""
        try:
            backups = await self.list_backups()
            backup = next((b for b in backups if b.backup_id == backup_id), None)
            
            if not backup:
                logger.error(f"Backup not found: {backup_id}")
                return False
            
            if not os.path.exists(backup.file_path):
                logger.error(f"Backup file not found: {backup.file_path}")
                return False
            
            # Verify file size
            actual_size = os.path.getsize(backup.file_path)
            if actual_size != backup.file_size_bytes:
                logger.error(f"Backup file size mismatch: expected {backup.file_size_bytes}, got {actual_size}")
                return False
            
            # Verify checksum
            actual_checksum = self._calculate_file_checksum(backup.file_path)
            if actual_checksum != backup.checksum:
                logger.error(f"Backup checksum mismatch: expected {backup.checksum}, got {actual_checksum}")
                return False
            
            logger.info(f"Backup integrity verified: {backup_id}")
            return True
            
        except Exception as e:
            logger.error(f"Backup verification failed: {str(e)}")
            return False


# Global backup manager instance
backup_manager = BackupManager()


async def create_backup() -> BackupMetadata:
    """Create a full backup - main entry point"""
    return await backup_manager.create_full_backup()


async def restore_backup(backup_id: str) -> bool:
    """Restore from backup - main entry point"""
    return await backup_manager.restore_from_backup(backup_id)


async def list_available_backups() -> List[BackupMetadata]:
    """List available backups - main entry point"""
    return await backup_manager.list_backups()


async def verify_backup(backup_id: str) -> bool:
    """Verify backup integrity - main entry point"""
    return await backup_manager.verify_backup_integrity(backup_id)