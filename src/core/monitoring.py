"""
Monitoring and health check utilities for the Knowledge Assistant RAG application.
Provides comprehensive service monitoring, alerting, and health status tracking.
"""

import asyncio
import logging
import time
import psutil
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from .database import User, DocumentMetadata, get_async_session
from .vector_store import get_qdrant_client
from .gemini_llm import get_gemini_client, generate_response
from .processing import get_embedding_model

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health status enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class ServiceHealth:
    """Service health status data class"""
    name: str
    status: HealthStatus
    response_time_ms: Optional[float] = None
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    last_check: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['status'] = self.status.value
        if self.last_check:
            result['last_check'] = self.last_check.isoformat()
        return result


@dataclass
class SystemMetrics:
    """System resource metrics"""
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    disk_free_gb: float
    uptime_seconds: float
    timestamp: datetime

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result


class HealthMonitor:
    """Comprehensive health monitoring system"""
    
    def __init__(self):
        self.service_checks: Dict[str, ServiceHealth] = {}
        self.system_metrics_history: List[SystemMetrics] = []
        self.max_history_size = 100
        self.alert_thresholds = {
            'cpu_percent': 80.0,
            'memory_percent': 85.0,
            'disk_percent': 90.0,
            'response_time_ms': 5000.0
        }
    
    async def check_database_health(self, session: AsyncSession) -> ServiceHealth:
        """Check database connectivity and performance"""
        start_time = time.time()
        
        try:
            # Test basic connectivity
            await session.execute(text("SELECT 1"))
            
            # Test user table access
            user_count = await session.execute(select(func.count(User.id)))
            user_count = user_count.scalar()
            
            # Test document table access
            doc_count = await session.execute(select(func.count(DocumentMetadata.id)))
            doc_count = doc_count.scalar()
            
            response_time = (time.time() - start_time) * 1000
            
            return ServiceHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                metadata={
                    "type": "sqlite",
                    "user_count": user_count,
                    "document_count": doc_count
                },
                last_check=datetime.utcnow()
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Database health check failed: {str(e)}")
            
            return ServiceHealth(
                name="database",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                error_message=str(e),
                last_check=datetime.utcnow()
            )
    
    async def check_qdrant_health(self) -> ServiceHealth:
        """Check Qdrant vector database health"""
        start_time = time.time()
        
        try:
            client = get_qdrant_client()
            
            # Get collections info
            collections = client.get_collections()
            collection_count = len(collections.collections)
            
            # Get cluster info if available
            try:
                cluster_info = client.get_cluster_info()
                cluster_status = "healthy"
            except:
                cluster_info = None
                cluster_status = "unknown"
            
            response_time = (time.time() - start_time) * 1000
            
            return ServiceHealth(
                name="qdrant",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                metadata={
                    "collections_count": collection_count,
                    "cluster_status": cluster_status,
                    "collections": [col.name for col in collections.collections]
                },
                last_check=datetime.utcnow()
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Qdrant health check failed: {str(e)}")
            
            return ServiceHealth(
                name="qdrant",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                error_message=str(e),
                last_check=datetime.utcnow()
            )
    
    async def check_gemini_health(self) -> ServiceHealth:
        """Check Google Gemini API health"""
        start_time = time.time()
        
        try:
            client = get_gemini_client()
            
            # Test with a simple prompt
            test_response = generate_response(client, "Hello, respond with 'OK' if you're working.")
            
            response_time = (time.time() - start_time) * 1000
            
            # Check if response is reasonable
            if test_response and len(test_response.strip()) > 0:
                status = HealthStatus.HEALTHY
            else:
                status = HealthStatus.DEGRADED
                
            return ServiceHealth(
                name="gemini",
                status=status,
                response_time_ms=response_time,
                metadata={
                    "model": "gemini-pro",
                    "test_response_length": len(test_response) if test_response else 0
                },
                last_check=datetime.utcnow()
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Gemini health check failed: {str(e)}")
            
            return ServiceHealth(
                name="gemini",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                error_message=str(e),
                last_check=datetime.utcnow()
            )
    
    async def check_embedding_model_health(self) -> ServiceHealth:
        """Check embedding model health"""
        start_time = time.time()
        
        try:
            model = get_embedding_model()
            
            # Test embedding generation
            test_embedding = model.encode("test health check")
            
            response_time = (time.time() - start_time) * 1000
            
            return ServiceHealth(
                name="embedding_model",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                metadata={
                    "embedding_dimension": len(test_embedding),
                    "model_type": type(model).__name__
                },
                last_check=datetime.utcnow()
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Embedding model health check failed: {str(e)}")
            
            return ServiceHealth(
                name="embedding_model",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                error_message=str(e),
                last_check=datetime.utcnow()
            )
    
    def get_system_metrics(self) -> SystemMetrics:
        """Get current system resource metrics"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            disk_free_gb = disk.free / (1024**3)
            
            # System uptime
            boot_time = psutil.boot_time()
            uptime_seconds = time.time() - boot_time
            
            return SystemMetrics(
                cpu_percent=cpu_percent,
                memory_percent=memory_percent,
                disk_percent=disk_percent,
                disk_free_gb=disk_free_gb,
                uptime_seconds=uptime_seconds,
                timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Failed to get system metrics: {str(e)}")
            return SystemMetrics(
                cpu_percent=0.0,
                memory_percent=0.0,
                disk_percent=0.0,
                disk_free_gb=0.0,
                uptime_seconds=0.0,
                timestamp=datetime.utcnow()
            )
    
    async def perform_comprehensive_health_check(self, session: AsyncSession) -> Dict[str, Any]:
        """Perform comprehensive health check of all services"""
        logger.info("Starting comprehensive health check...")
        
        # Run all health checks concurrently
        health_checks = await asyncio.gather(
            self.check_database_health(session),
            self.check_qdrant_health(),
            self.check_gemini_health(),
            self.check_embedding_model_health(),
            return_exceptions=True
        )
        
        # Process results
        services = {}
        overall_status = HealthStatus.HEALTHY
        
        for check in health_checks:
            if isinstance(check, Exception):
                logger.error(f"Health check failed with exception: {str(check)}")
                continue
                
            services[check.name] = check.to_dict()
            self.service_checks[check.name] = check
            
            # Update overall status
            if check.status == HealthStatus.UNHEALTHY:
                overall_status = HealthStatus.UNHEALTHY
            elif check.status == HealthStatus.DEGRADED and overall_status == HealthStatus.HEALTHY:
                overall_status = HealthStatus.DEGRADED
        
        # Get system metrics
        system_metrics = self.get_system_metrics()
        self.system_metrics_history.append(system_metrics)
        
        # Keep history size manageable
        if len(self.system_metrics_history) > self.max_history_size:
            self.system_metrics_history = self.system_metrics_history[-self.max_history_size:]
        
        # Check for system resource alerts
        alerts = self.check_system_alerts(system_metrics)
        
        return {
            "status": overall_status.value,
            "timestamp": datetime.utcnow().isoformat(),
            "services": services,
            "system_metrics": system_metrics.to_dict(),
            "alerts": alerts,
            "summary": {
                "total_services": len(services),
                "healthy_services": len([s for s in services.values() if s["status"] == "healthy"]),
                "degraded_services": len([s for s in services.values() if s["status"] == "degraded"]),
                "unhealthy_services": len([s for s in services.values() if s["status"] == "unhealthy"])
            }
        }
    
    def check_system_alerts(self, metrics: SystemMetrics) -> List[Dict[str, Any]]:
        """Check system metrics against alert thresholds"""
        alerts = []
        
        if metrics.cpu_percent > self.alert_thresholds['cpu_percent']:
            alerts.append({
                "type": "high_cpu_usage",
                "severity": "warning",
                "message": f"CPU usage is {metrics.cpu_percent:.1f}% (threshold: {self.alert_thresholds['cpu_percent']}%)",
                "value": metrics.cpu_percent,
                "threshold": self.alert_thresholds['cpu_percent']
            })
        
        if metrics.memory_percent > self.alert_thresholds['memory_percent']:
            alerts.append({
                "type": "high_memory_usage",
                "severity": "warning",
                "message": f"Memory usage is {metrics.memory_percent:.1f}% (threshold: {self.alert_thresholds['memory_percent']}%)",
                "value": metrics.memory_percent,
                "threshold": self.alert_thresholds['memory_percent']
            })
        
        if metrics.disk_percent > self.alert_thresholds['disk_percent']:
            alerts.append({
                "type": "high_disk_usage",
                "severity": "critical",
                "message": f"Disk usage is {metrics.disk_percent:.1f}% (threshold: {self.alert_thresholds['disk_percent']}%)",
                "value": metrics.disk_percent,
                "threshold": self.alert_thresholds['disk_percent']
            })
        
        if metrics.disk_free_gb < 1.0:
            alerts.append({
                "type": "low_disk_space",
                "severity": "critical",
                "message": f"Only {metrics.disk_free_gb:.2f} GB free disk space remaining",
                "value": metrics.disk_free_gb,
                "threshold": 1.0
            })
        
        return alerts
    
    def get_service_status_dashboard(self) -> Dict[str, Any]:
        """Get service status dashboard data"""
        dashboard_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "services": {},
            "system_metrics": None,
            "recent_alerts": []
        }
        
        # Add service statuses
        for name, health in self.service_checks.items():
            dashboard_data["services"][name] = health.to_dict()
        
        # Add latest system metrics
        if self.system_metrics_history:
            dashboard_data["system_metrics"] = self.system_metrics_history[-1].to_dict()
            
            # Get recent alerts from last few metrics
            recent_metrics = self.system_metrics_history[-5:]  # Last 5 checks
            for metrics in recent_metrics:
                alerts = self.check_system_alerts(metrics)
                dashboard_data["recent_alerts"].extend(alerts)
        
        return dashboard_data


# Global health monitor instance
health_monitor = HealthMonitor()


async def get_health_status(session: AsyncSession) -> Dict[str, Any]:
    """Get comprehensive health status - main entry point"""
    return await health_monitor.perform_comprehensive_health_check(session)


def get_service_dashboard() -> Dict[str, Any]:
    """Get service status dashboard - main entry point"""
    return health_monitor.get_service_status_dashboard()