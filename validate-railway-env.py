#!/usr/bin/env python3
"""
Railway Environment Variable Validation Script
Validates and reports on environment variable configuration for Railway deployment
"""

import os
import sys
import re
import json
from urllib.parse import urlparse
from typing import Dict, List, Tuple, Optional

class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

def log(message: str, color: str = Colors.BLUE):
    print(f"{color}[INFO]{Colors.NC} {message}")

def error(message: str):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {message}", file=sys.stderr)

def success(message: str):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

def warning(message: str):
    print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")

class RailwayEnvValidator:
    def __init__(self, env_file: str = ".env.railway"):
        self.env_file = env_file
        self.env_vars = {}
        self.validation_results = []
        self.load_environment()
    
    def load_environment(self):
        """Load environment variables from file and system"""
        # Load from file if it exists
        if os.path.exists(self.env_file):
            with open(self.env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        self.env_vars[key.strip()] = value.strip().strip('"\'')
        
        # Override with system environment variables
        for key in os.environ:
            self.env_vars[key] = os.environ[key]
    
    def validate_required_vars(self) -> bool:
        """Validate required environment variables"""
        log("Validating required environment variables...")
        
        required_vars = [
            'JWT_SECRET',
        ]
        
        missing_vars = []
        for var in required_vars:
            if var not in self.env_vars or not self.env_vars[var]:
                missing_vars.append(var)
        
        if missing_vars:
            error(f"Missing required variables: {', '.join(missing_vars)}")
            return False
        
        success("All required variables are present")
        return True
    
    def validate_jwt_secret(self) -> bool:
        """Validate JWT secret strength"""
        log("Validating JWT secret...")
        
        jwt_secret = self.env_vars.get('JWT_SECRET', '')
        
        if not jwt_secret:
            error("JWT_SECRET is not set")
            return False
        
        if jwt_secret in ['your-super-secret-jwt-key-change-in-production', 
                         'your-super-secret-jwt-key-change-in-production-minimum-32-chars']:
            error("JWT_SECRET is still using default template value")
            return False
        
        if len(jwt_secret) < 32:
            error(f"JWT_SECRET is too short ({len(jwt_secret)} chars). Minimum 32 characters required.")
            return False
        
        # Check for common weak patterns
        if jwt_secret.lower() in ['password', '123456', 'secret', 'admin']:
            error("JWT_SECRET is too weak")
            return False
        
        success(f"JWT_SECRET is valid ({len(jwt_secret)} characters)")
        return True
    
    def validate_database_url(self) -> bool:
        """Validate database URL configuration"""
        log("Validating database configuration...")
        
        db_url = self.env_vars.get('DATABASE_URL', '')
        
        if not db_url:
            warning("DATABASE_URL not set, will use default SQLite")
            return True
        
        try:
            parsed = urlparse(db_url)
            
            if parsed.scheme in ['sqlite', 'sqlite+aiosqlite']:
                success("Using SQLite database")
                return True
            elif parsed.scheme in ['postgresql', 'postgresql+asyncpg']:
                success("Using PostgreSQL database")
                if not parsed.hostname:
                    warning("PostgreSQL hostname not specified")
                return True
            else:
                warning(f"Unknown database scheme: {parsed.scheme}")
                return True
        
        except Exception as e:
            error(f"Invalid DATABASE_URL format: {e}")
            return False
    
    def validate_cors_origins(self) -> bool:
        """Validate CORS origins configuration"""
        log("Validating CORS origins...")
        
        cors_origins = self.env_vars.get('CORS_ORIGINS', '')
        
        if not cors_origins:
            warning("CORS_ORIGINS not set, will default to allowing all origins")
            return True
        
        origins = [origin.strip() for origin in cors_origins.split(',')]
        
        for origin in origins:
            if origin == '*':
                warning("CORS allows all origins (*) - consider restricting for production")
                continue
            
            if not origin.startswith(('http://', 'https://')):
                error(f"Invalid CORS origin format: {origin}")
                return False
            
            try:
                parsed = urlparse(origin)
                if not parsed.hostname:
                    error(f"Invalid CORS origin hostname: {origin}")
                    return False
            except Exception as e:
                error(f"Invalid CORS origin: {origin} - {e}")
                return False
        
        success(f"CORS origins validated: {len(origins)} origins")
        return True
    
    def validate_external_services(self) -> bool:
        """Validate external service configurations"""
        log("Validating external service configurations...")
        
        # Check Qdrant configuration
        qdrant_cloud_url = self.env_vars.get('QDRANT_CLOUD_URL')
        qdrant_host = self.env_vars.get('QDRANT_HOST', 'qdrant')
        
        if qdrant_cloud_url:
            success("Using Qdrant Cloud service")
            if not self.env_vars.get('QDRANT_API_KEY'):
                warning("QDRANT_API_KEY not set for Qdrant Cloud")
        else:
            log(f"Using local Qdrant service: {qdrant_host}")
        
        # Check LLM configuration
        openai_key = self.env_vars.get('OPENAI_API_KEY')
        use_openai = self.env_vars.get('USE_OPENAI_INSTEAD_OF_OLLAMA', 'false').lower() == 'true'
        ollama_host = self.env_vars.get('OLLAMA_HOST', 'ollama')
        
        if openai_key and use_openai:
            success("Using OpenAI API for LLM")
        else:
            log(f"Using local Ollama service: {ollama_host}")
            if not openai_key:
                warning("Consider using OpenAI API for better Railway resource utilization")
        
        return True
    
    def validate_frontend_config(self) -> bool:
        """Validate frontend configuration"""
        log("Validating frontend configuration...")
        
        api_base_url = self.env_vars.get('VITE_API_BASE_URL')
        
        if not api_base_url:
            warning("VITE_API_BASE_URL not set")
            return True
        
        if api_base_url.startswith('http://localhost'):
            warning("VITE_API_BASE_URL points to localhost - update for production")
        
        try:
            parsed = urlparse(api_base_url)
            if not parsed.hostname:
                error(f"Invalid VITE_API_BASE_URL: {api_base_url}")
                return False
        except Exception as e:
            error(f"Invalid VITE_API_BASE_URL format: {e}")
            return False
        
        success("Frontend configuration validated")
        return True
    
    def validate_numeric_values(self) -> bool:
        """Validate numeric environment variables"""
        log("Validating numeric values...")
        
        numeric_vars = {
            'JWT_LIFETIME_SECONDS': (300, 86400),  # 5 minutes to 24 hours
            'VITE_API_TIMEOUT': (5000, 120000),    # 5 seconds to 2 minutes
            'QDRANT_PORT': (1, 65535),
            'OLLAMA_PORT': (1, 65535),
        }
        
        for var, (min_val, max_val) in numeric_vars.items():
            value = self.env_vars.get(var)
            if value:
                try:
                    num_value = int(value)
                    if not (min_val <= num_value <= max_val):
                        warning(f"{var}={num_value} is outside recommended range ({min_val}-{max_val})")
                except ValueError:
                    error(f"{var} must be a numeric value, got: {value}")
                    return False
        
        success("Numeric values validated")
        return True
    
    def validate_boolean_values(self) -> bool:
        """Validate boolean environment variables"""
        log("Validating boolean values...")
        
        boolean_vars = [
            'USER_REGISTRATION_ENABLED',
            'EMAIL_VERIFICATION_REQUIRED',
            'VITE_ENABLE_REGISTRATION',
            'USE_OPENAI_INSTEAD_OF_OLLAMA',
        ]
        
        for var in boolean_vars:
            value = self.env_vars.get(var)
            if value and value.lower() not in ['true', 'false', '1', '0', 'yes', 'no']:
                warning(f"{var} should be a boolean value (true/false), got: {value}")
        
        success("Boolean values validated")
        return True
    
    def check_railway_specific_vars(self) -> bool:
        """Check Railway-specific environment variables"""
        log("Checking Railway-specific variables...")
        
        # Railway automatically sets these
        railway_vars = ['PORT', 'RAILWAY_ENVIRONMENT', 'RAILWAY_SERVICE_NAME']
        
        for var in railway_vars:
            if var in self.env_vars:
                log(f"Railway variable detected: {var}")
        
        # Check for PORT configuration
        port = self.env_vars.get('PORT', '8000')
        try:
            port_num = int(port)
            if port_num != 8000:
                log(f"Using custom port: {port_num}")
        except ValueError:
            error(f"Invalid PORT value: {port}")
            return False
        
        success("Railway-specific variables checked")
        return True
    
    def generate_report(self) -> Dict:
        """Generate a comprehensive validation report"""
        log("Generating validation report...")
        
        report = {
            'timestamp': os.popen('date').read().strip(),
            'env_file': self.env_file,
            'total_variables': len(self.env_vars),
            'validations': [],
            'recommendations': [],
            'variables': {}
        }
        
        # Categorize variables
        sensitive_vars = ['JWT_SECRET', 'QDRANT_API_KEY', 'OPENAI_API_KEY']
        
        for key, value in self.env_vars.items():
            if key in sensitive_vars:
                report['variables'][key] = '*' * len(value) if value else 'NOT SET'
            else:
                report['variables'][key] = value
        
        # Add recommendations
        if not self.env_vars.get('OPENAI_API_KEY'):
            report['recommendations'].append("Consider using OpenAI API to reduce Railway resource usage")
        
        if not self.env_vars.get('QDRANT_CLOUD_URL'):
            report['recommendations'].append("Consider using Qdrant Cloud for better scalability")
        
        if self.env_vars.get('CORS_ORIGINS') == '*':
            report['recommendations'].append("Restrict CORS origins for production security")
        
        return report
    
    def run_all_validations(self) -> bool:
        """Run all validation checks"""
        log("Starting comprehensive environment validation...")
        
        validations = [
            self.validate_required_vars,
            self.validate_jwt_secret,
            self.validate_database_url,
            self.validate_cors_origins,
            self.validate_external_services,
            self.validate_frontend_config,
            self.validate_numeric_values,
            self.validate_boolean_values,
            self.check_railway_specific_vars,
        ]
        
        failed_validations = 0
        
        for validation in validations:
            try:
                if not validation():
                    failed_validations += 1
            except Exception as e:
                error(f"Validation error: {e}")
                failed_validations += 1
        
        print("\n" + "="*50)
        if failed_validations == 0:
            success("All validations passed!")
            return True
        else:
            error(f"{failed_validations} validation(s) failed")
            return False

def main():
    """Main function"""
    if len(sys.argv) > 1:
        if sys.argv[1] in ['--help', '-h']:
            print("Railway Environment Validation Script")
            print("\nUsage: python3 validate-railway-env.py [env_file]")
            print("\nOptions:")
            print("  --help, -h    Show this help message")
            print("  --report      Generate JSON report")
            print("\nDefault env file: .env.railway")
            return
        elif sys.argv[1] == '--report':
            validator = RailwayEnvValidator()
            report = validator.generate_report()
            print(json.dumps(report, indent=2))
            return
        else:
            env_file = sys.argv[1]
    else:
        env_file = ".env.railway"
    
    if not os.path.exists(env_file):
        error(f"Environment file not found: {env_file}")
        print("Create the file from template:")
        print(f"  cp .env.railway.template {env_file}")
        sys.exit(1)
    
    validator = RailwayEnvValidator(env_file)
    
    if validator.run_all_validations():
        print("\n" + "="*50)
        success("Environment is ready for Railway deployment!")
        sys.exit(0)
    else:
        print("\n" + "="*50)
        error("Environment validation failed. Please fix the issues above.")
        sys.exit(1)

if __name__ == "__main__":
    main()