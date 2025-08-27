#!/usr/bin/env python3
"""
Data Persistence Verification Script

This script verifies data persistence across the Knowledge Assistant RAG application,
including database integrity, vector store consistency, and backup validation.
"""

import os
import sys
import json
import sqlite3
import asyncio
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional

# Add the src directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import User, DocumentMetadata
from core.vector_store import get_qdrant_client
from core.backup import backup_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DataPersistenceVerifier:
    """Comprehensive data persistence verification system"""
    
    def __init__(self, database_path: str = "knowledge_assistant.db"):
        self.database_path = database_path
        self.verification_results = {}
        
    def verify_database_integrity(self) -> Dict[str, Any]:
        """Verify SQLite database integrity"""
        logger.info("Verifying database integrity...")
        
        result = {
            "test": "database_integrity",
            "status": "unknown",
            "details": {},
            "errors": []
        }
        
        try:
            if not os.path.exists(self.database_path):
                result["status"] = "failed"
                result["errors"].append(f"Database file not found: {self.database_path}")
                return result
            
            # Connect to database
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            # Check database integrity
            cursor.execute("PRAGMA integrity_check")
            integrity_result = cursor.fetchone()[0]
            
            if integrity_result == "ok":
                result["details"]["integrity_check"] = "passed"
            else:
                result["status"] = "failed"
                result["errors"].append(f"Database integrity check failed: {integrity_result}")
                conn.close()
                return result
            
            # Check table existence
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            expected_tables = ["users", "documents", "alembic_version"]
            missing_tables = [table for table in expected_tables if table not in tables]
            
            if missing_tables:
                result["status"] = "failed"
                result["errors"].append(f"Missing tables: {missing_tables}")
                conn.close()
                return result
            
            result["details"]["tables"] = tables
            
            # Check record counts
            cursor.execute("SELECT COUNT(*) FROM users")
            user_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM documents")
            doc_count = cursor.fetchone()[0]
            
            result["details"]["user_count"] = user_count
            result["details"]["document_count"] = doc_count
            
            # Check for orphaned documents (documents without users)
            cursor.execute("""
                SELECT COUNT(*) FROM documents d 
                LEFT JOIN users u ON d.user_id = u.id 
                WHERE u.id IS NULL
            """)
            orphaned_docs = cursor.fetchone()[0]
            
            if orphaned_docs > 0:
                result["errors"].append(f"Found {orphaned_docs} orphaned documents")
            
            result["details"]["orphaned_documents"] = orphaned_docs
            
            # Check for duplicate file hashes
            cursor.execute("""
                SELECT file_hash, COUNT(*) as count 
                FROM documents 
                WHERE file_hash IS NOT NULL 
                GROUP BY file_hash 
                HAVING COUNT(*) > 1
            """)
            duplicate_hashes = cursor.fetchall()
            
            if duplicate_hashes:
                result["details"]["duplicate_file_hashes"] = len(duplicate_hashes)
                result["errors"].append(f"Found {len(duplicate_hashes)} duplicate file hashes")
            else:
                result["details"]["duplicate_file_hashes"] = 0
            
            conn.close()
            
            if not result["errors"]:
                result["status"] = "passed"
            else:
                result["status"] = "warning"
            
            logger.info(f"Database integrity check: {result['status']}")
            
        except Exception as e:
            result["status"] = "failed"
            result["errors"].append(f"Database verification failed: {str(e)}")
            logger.error(f"Database verification error: {str(e)}")
        
        return result
    
    async def verify_vector_store_consistency(self) -> Dict[str, Any]:
        """Verify Qdrant vector store consistency"""
        logger.info("Verifying vector store consistency...")
        
        result = {
            "test": "vector_store_consistency",
            "status": "unknown",
            "details": {},
            "errors": []
        }
        
        try:
            client = get_qdrant_client()
            
            # Get collections info
            collections_info = client.get_collections()
            collections = collections_info.collections
            
            result["details"]["total_collections"] = len(collections)
            result["details"]["collections"] = []
            
            total_points = 0
            
            for collection in collections:
                collection_name = collection.name
                
                try:
                    # Get collection info
                    collection_info = client.get_collection(collection_name)
                    points_count = collection_info.points_count
                    
                    # Get sample points to verify structure
                    sample_points, _ = client.scroll(
                        collection_name=collection_name,
                        limit=10,
                        with_payload=True,
                        with_vectors=True
                    )
                    
                    collection_details = {
                        "name": collection_name,
                        "points_count": points_count,
                        "sample_points": len(sample_points),
                        "status": "healthy"
                    }
                    
                    # Verify point structure
                    if sample_points:
                        first_point = sample_points[0]
                        
                        # Check if point has required fields
                        if not hasattr(first_point, 'payload') or not first_point.payload:
                            collection_details["status"] = "warning"
                            result["errors"].append(f"Collection {collection_name}: Points missing payload")
                        
                        if not hasattr(first_point, 'vector') or not first_point.vector:
                            collection_details["status"] = "warning"
                            result["errors"].append(f"Collection {collection_name}: Points missing vectors")
                        
                        # Check payload structure for user collections
                        if collection_name.startswith("user_") and first_point.payload:
                            required_fields = ["text", "source", "user_id"]
                            missing_fields = [field for field in required_fields if field not in first_point.payload]
                            
                            if missing_fields:
                                collection_details["status"] = "warning"
                                result["errors"].append(f"Collection {collection_name}: Missing payload fields: {missing_fields}")
                    
                    result["details"]["collections"].append(collection_details)
                    total_points += points_count
                    
                except Exception as e:
                    collection_details = {
                        "name": collection_name,
                        "status": "error",
                        "error": str(e)
                    }
                    result["details"]["collections"].append(collection_details)
                    result["errors"].append(f"Collection {collection_name}: {str(e)}")
            
            result["details"]["total_points"] = total_points
            
            # Cross-reference with database
            if os.path.exists(self.database_path):
                conn = sqlite3.connect(self.database_path)
                cursor = conn.cursor()
                
                # Get user count from database
                cursor.execute("SELECT COUNT(DISTINCT user_id) FROM documents")
                db_users_with_docs = cursor.fetchone()[0]
                
                # Count user collections in Qdrant
                user_collections = [c for c in collections if c.name.startswith("user_")]
                qdrant_user_collections = len(user_collections)
                
                result["details"]["db_users_with_documents"] = db_users_with_docs
                result["details"]["qdrant_user_collections"] = qdrant_user_collections
                
                # Check for consistency
                if db_users_with_docs != qdrant_user_collections:
                    result["errors"].append(
                        f"Mismatch between database users with documents ({db_users_with_docs}) "
                        f"and Qdrant user collections ({qdrant_user_collections})"
                    )
                
                conn.close()
            
            if not result["errors"]:
                result["status"] = "passed"
            else:
                result["status"] = "warning"
            
            logger.info(f"Vector store consistency check: {result['status']}")
            
        except Exception as e:
            result["status"] = "failed"
            result["errors"].append(f"Vector store verification failed: {str(e)}")
            logger.error(f"Vector store verification error: {str(e)}")
        
        return result
    
    async def verify_backup_integrity(self) -> Dict[str, Any]:
        """Verify backup integrity and completeness"""
        logger.info("Verifying backup integrity...")
        
        result = {
            "test": "backup_integrity",
            "status": "unknown",
            "details": {},
            "errors": []
        }
        
        try:
            # List available backups
            backups = await backup_manager.list_backups()
            
            result["details"]["total_backups"] = len(backups)
            result["details"]["backups"] = []
            
            if not backups:
                result["status"] = "warning"
                result["errors"].append("No backups found")
                return result
            
            # Verify each backup
            verified_count = 0
            failed_count = 0
            
            for backup in backups:
                backup_details = {
                    "backup_id": backup.backup_id,
                    "timestamp": backup.timestamp.isoformat(),
                    "file_size_bytes": backup.file_size_bytes,
                    "status": backup.status
                }
                
                try:
                    # Verify backup integrity
                    is_valid = await backup_manager.verify_backup_integrity(backup.backup_id)
                    
                    if is_valid:
                        backup_details["integrity"] = "valid"
                        verified_count += 1
                    else:
                        backup_details["integrity"] = "invalid"
                        failed_count += 1
                        result["errors"].append(f"Backup {backup.backup_id} failed integrity check")
                    
                except Exception as e:
                    backup_details["integrity"] = "error"
                    backup_details["error"] = str(e)
                    failed_count += 1
                    result["errors"].append(f"Backup {backup.backup_id} verification error: {str(e)}")
                
                result["details"]["backups"].append(backup_details)
            
            result["details"]["verified_backups"] = verified_count
            result["details"]["failed_backups"] = failed_count
            
            # Check backup freshness
            if backups:
                latest_backup = max(backups, key=lambda b: b.timestamp)
                days_since_backup = (datetime.utcnow() - latest_backup.timestamp).days
                
                result["details"]["days_since_latest_backup"] = days_since_backup
                
                if days_since_backup > 7:
                    result["errors"].append(f"Latest backup is {days_since_backup} days old")
            
            if failed_count == 0 and not result["errors"]:
                result["status"] = "passed"
            elif failed_count < len(backups):
                result["status"] = "warning"
            else:
                result["status"] = "failed"
            
            logger.info(f"Backup integrity check: {result['status']}")
            
        except Exception as e:
            result["status"] = "failed"
            result["errors"].append(f"Backup verification failed: {str(e)}")
            logger.error(f"Backup verification error: {str(e)}")
        
        return result
    
    def verify_file_system_integrity(self) -> Dict[str, Any]:
        """Verify file system integrity and permissions"""
        logger.info("Verifying file system integrity...")
        
        result = {
            "test": "file_system_integrity",
            "status": "unknown",
            "details": {},
            "errors": []
        }
        
        try:
            # Check critical directories and files
            critical_paths = [
                {"path": ".", "type": "directory", "name": "application_root"},
                {"path": self.database_path, "type": "file", "name": "database"},
                {"path": "uploads", "type": "directory", "name": "uploads_directory"},
                {"path": "backups", "type": "directory", "name": "backups_directory"},
                {"path": "src", "type": "directory", "name": "source_code"},
            ]
            
            result["details"]["path_checks"] = []
            
            for path_info in critical_paths:
                path = path_info["path"]
                path_type = path_info["type"]
                name = path_info["name"]
                
                check_result = {
                    "name": name,
                    "path": path,
                    "type": path_type,
                    "exists": False,
                    "readable": False,
                    "writable": False
                }
                
                if os.path.exists(path):
                    check_result["exists"] = True
                    
                    # Check permissions
                    check_result["readable"] = os.access(path, os.R_OK)
                    check_result["writable"] = os.access(path, os.W_OK)
                    
                    if path_type == "directory":
                        check_result["executable"] = os.access(path, os.X_OK)
                    
                    # Get size information
                    if path_type == "file":
                        check_result["size_bytes"] = os.path.getsize(path)
                    elif path_type == "directory":
                        try:
                            # Count files in directory
                            file_count = len([f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))])
                            check_result["file_count"] = file_count
                        except PermissionError:
                            check_result["file_count"] = "permission_denied"
                else:
                    result["errors"].append(f"Critical path missing: {path} ({name})")
                
                result["details"]["path_checks"].append(check_result)
            
            # Check disk space
            try:
                import shutil
                total, used, free = shutil.disk_usage(".")
                
                result["details"]["disk_usage"] = {
                    "total_bytes": total,
                    "used_bytes": used,
                    "free_bytes": free,
                    "free_gb": free / (1024**3),
                    "usage_percent": (used / total) * 100
                }
                
                # Check if disk space is critically low
                free_gb = free / (1024**3)
                if free_gb < 1.0:
                    result["errors"].append(f"Critical: Only {free_gb:.2f} GB free disk space")
                elif free_gb < 5.0:
                    result["errors"].append(f"Warning: Only {free_gb:.2f} GB free disk space")
                
            except Exception as e:
                result["errors"].append(f"Could not check disk usage: {str(e)}")
            
            if not result["errors"]:
                result["status"] = "passed"
            else:
                result["status"] = "warning"
            
            logger.info(f"File system integrity check: {result['status']}")
            
        except Exception as e:
            result["status"] = "failed"
            result["errors"].append(f"File system verification failed: {str(e)}")
            logger.error(f"File system verification error: {str(e)}")
        
        return result
    
    async def run_comprehensive_verification(self) -> Dict[str, Any]:
        """Run all verification tests"""
        logger.info("Starting comprehensive data persistence verification...")
        
        start_time = datetime.utcnow()
        
        # Run all verification tests
        tests = [
            self.verify_database_integrity(),
            await self.verify_vector_store_consistency(),
            await self.verify_backup_integrity(),
            self.verify_file_system_integrity()
        ]
        
        # Collect results
        verification_results = {
            "timestamp": start_time.isoformat(),
            "duration_seconds": (datetime.utcnow() - start_time).total_seconds(),
            "overall_status": "unknown",
            "tests": tests,
            "summary": {
                "total_tests": len(tests),
                "passed": 0,
                "warnings": 0,
                "failed": 0
            }
        }
        
        # Calculate summary
        for test in tests:
            if test["status"] == "passed":
                verification_results["summary"]["passed"] += 1
            elif test["status"] == "warning":
                verification_results["summary"]["warnings"] += 1
            elif test["status"] == "failed":
                verification_results["summary"]["failed"] += 1
        
        # Determine overall status
        if verification_results["summary"]["failed"] > 0:
            verification_results["overall_status"] = "failed"
        elif verification_results["summary"]["warnings"] > 0:
            verification_results["overall_status"] = "warning"
        else:
            verification_results["overall_status"] = "passed"
        
        logger.info(f"Verification completed: {verification_results['overall_status']}")
        
        return verification_results


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description="Data Persistence Verification Tool")
    parser.add_argument("--database", default="knowledge_assistant.db", help="Database file path")
    parser.add_argument("--output", help="Output file for results (JSON)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create verifier
    verifier = DataPersistenceVerifier(args.database)
    
    # Run verification
    try:
        results = asyncio.run(verifier.run_comprehensive_verification())
        
        # Output results
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"Results saved to: {args.output}")
        else:
            print(json.dumps(results, indent=2))
        
        # Exit with appropriate code
        if results["overall_status"] == "failed":
            sys.exit(1)
        elif results["overall_status"] == "warning":
            sys.exit(2)
        else:
            sys.exit(0)
            
    except Exception as e:
        logger.error(f"Verification failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()