"""
Railway Database Configuration Helper
Handles both PostgreSQL (Railway managed) and SQLite fallback
"""

import os
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def get_railway_database_url():
    """
    Get the appropriate database URL for Railway deployment.
    Prioritizes Railway PostgreSQL, falls back to SQLite.
    """
    # Check for Railway PostgreSQL URL
    railway_db_url = os.getenv('DATABASE_URL')
    
    if railway_db_url and railway_db_url.startswith('postgresql'):
        logger.info("Using Railway PostgreSQL database")
        # Convert postgresql:// to postgresql+asyncpg:// for async support
        if railway_db_url.startswith('postgresql://'):
            railway_db_url = railway_db_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
        return railway_db_url
    
    # Fallback to SQLite
    sqlite_url = "sqlite+aiosqlite:///./data/knowledge_assistant.db"
    logger.info("Using SQLite database fallback")
    return sqlite_url

def get_railway_environment_config():
    """
    Get Railway-specific environment configuration
    """
    config = {
        'database_url': get_railway_database_url(),
        'port': int(os.getenv('PORT', 8000)),
        'cors_origins': os.getenv('CORS_ORIGINS', '').split(',') if os.getenv('CORS_ORIGINS') else ['*'],
        'jwt_secret': os.getenv('JWT_SECRET', 'railway-default-secret-change-in-production'),
        'jwt_lifetime': int(os.getenv('JWT_LIFETIME_SECONDS', 3600)),
        'user_registration_enabled': os.getenv('USER_REGISTRATION_ENABLED', 'true').lower() == 'true',
        'email_verification_required': os.getenv('EMAIL_VERIFICATION_REQUIRED', 'false').lower() == 'true',
    }
    
    # External services configuration
    config.update({
        'qdrant_host': os.getenv('QDRANT_HOST', 'localhost'),
        'qdrant_port': int(os.getenv('QDRANT_PORT', 6333)),
        'ollama_host': os.getenv('OLLAMA_HOST', 'localhost'),
        'ollama_port': int(os.getenv('OLLAMA_PORT', 11434)),
        'ollama_model': os.getenv('OLLAMA_MODEL', 'llama3.2:1b'),
    })
    
    # Optional external service URLs (for hybrid deployment)
    if os.getenv('QDRANT_CLOUD_URL'):
        config['qdrant_cloud_url'] = os.getenv('QDRANT_CLOUD_URL')
        config['qdrant_api_key'] = os.getenv('QDRANT_API_KEY')
    
    if os.getenv('OPENAI_API_KEY'):
        config['openai_api_key'] = os.getenv('OPENAI_API_KEY')
        config['use_openai'] = os.getenv('USE_OPENAI_INSTEAD_OF_OLLAMA', 'false').lower() == 'true'
    
    return config

def validate_railway_config():
    """
    Validate Railway configuration and log warnings for missing required variables
    """
    required_vars = ['JWT_SECRET']
    missing_vars = []
    
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.warning(f"Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    # Validate JWT secret strength
    jwt_secret = os.getenv('JWT_SECRET', '')
    if len(jwt_secret) < 32:
        logger.warning("JWT_SECRET should be at least 32 characters long for security")
    
    return True

if __name__ == "__main__":
    # Test configuration
    logging.basicConfig(level=logging.INFO)
    config = get_railway_environment_config()
    is_valid = validate_railway_config()
    
    print("Railway Configuration:")
    for key, value in config.items():
        if 'secret' in key.lower() or 'key' in key.lower():
            print(f"  {key}: {'*' * len(str(value)) if value else 'NOT SET'}")
        else:
            print(f"  {key}: {value}")
    
    print(f"\nConfiguration valid: {is_valid}")