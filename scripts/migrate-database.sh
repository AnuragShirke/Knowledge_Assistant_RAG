#!/bin/bash

# Database Migration Utility Script
# This script handles database migrations and initialization for different environments

set -e

# Source deployment utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deployment-utils.sh"

# Configuration
ALEMBIC_DIR="alembic"
BACKUP_DIR="backups/migrations"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database before migration
backup_database() {
    local database_url=$1
    local backup_name=${2:-"pre_migration_$(date +%Y%m%d_%H%M%S)"}
    
    log "Creating database backup before migration..."
    
    if [[ "$database_url" == sqlite* ]]; then
        # SQLite backup
        local db_file=$(echo "$database_url" | sed 's/sqlite:\/\/\///')
        if [ -f "$db_file" ]; then
            cp "$db_file" "$BACKUP_DIR/${backup_name}.db"
            gzip "$BACKUP_DIR/${backup_name}.db"
            success "SQLite database backed up to $BACKUP_DIR/${backup_name}.db.gz"
        else
            warning "SQLite database file not found: $db_file"
        fi
    elif [[ "$database_url" == postgresql* ]]; then
        # PostgreSQL backup
        if command -v pg_dump &> /dev/null; then
            pg_dump "$database_url" | gzip > "$BACKUP_DIR/${backup_name}.sql.gz"
            success "PostgreSQL database backed up to $BACKUP_DIR/${backup_name}.sql.gz"
        else
            warning "pg_dump not available, skipping PostgreSQL backup"
        fi
    else
        warning "Unknown database type, skipping backup"
    fi
}

# Check migration status
check_migration_status() {
    local database_url=$1
    
    log "Checking current migration status..."
    
    export DATABASE_URL="$database_url"
    
    if [ -d "$ALEMBIC_DIR" ] && command -v alembic &> /dev/null; then
        local current_revision
        current_revision=$(alembic current 2>/dev/null | grep -o '[a-f0-9]\{12\}' | head -1 || echo "none")
        
        local head_revision
        head_revision=$(alembic heads 2>/dev/null | grep -o '[a-f0-9]\{12\}' | head -1 || echo "unknown")
        
        info "Current revision: $current_revision"
        info "Head revision: $head_revision"
        
        if [ "$current_revision" = "$head_revision" ]; then
            success "Database is up to date"
            return 0
        elif [ "$current_revision" = "none" ]; then
            warning "Database has no migration history"
            return 1
        else
            warning "Database needs migration"
            return 1
        fi
    else
        warning "Alembic not available or not configured"
        return 1
    fi
}

# Run database migrations
run_migrations() {
    local database_url=$1
    local target_revision=${2:-"head"}
    
    log "Running database migrations to $target_revision..."
    
    export DATABASE_URL="$database_url"
    
    if [ ! -d "$ALEMBIC_DIR" ]; then
        error "Alembic directory not found: $ALEMBIC_DIR"
        return 1
    fi
    
    if ! command -v alembic &> /dev/null; then
        error "Alembic not installed. Install with: pip install alembic"
        return 1
    fi
    
    # Check if database exists and is accessible
    if ! check_database_connection "$database_url"; then
        error "Cannot connect to database"
        return 1
    fi
    
    # Run migrations
    alembic upgrade "$target_revision"
    success "Database migrations completed"
}

# Check database connection
check_database_connection() {
    local database_url=$1
    
    if [[ "$database_url" == sqlite* ]]; then
        # SQLite connection check
        local db_file=$(echo "$database_url" | sed 's/sqlite:\/\/\///')
        local db_dir=$(dirname "$db_file")
        
        # Create directory if it doesn't exist
        mkdir -p "$db_dir"
        
        # Test SQLite connection
        if sqlite3 "$db_file" "SELECT 1;" &> /dev/null; then
            return 0
        else
            return 1
        fi
    elif [[ "$database_url" == postgresql* ]]; then
        # PostgreSQL connection check
        if command -v psql &> /dev/null; then
            if psql "$database_url" -c "SELECT 1;" &> /dev/null; then
                return 0
            else
                return 1
            fi
        else
            warning "psql not available, cannot verify PostgreSQL connection"
            return 1
        fi
    else
        warning "Unknown database type, cannot verify connection"
        return 1
    fi
}

# Initialize database (create tables if they don't exist)
initialize_database() {
    local database_url=$1
    
    log "Initializing database..."
    
    export DATABASE_URL="$database_url"
    
    # Check if database is already initialized
    if check_migration_status "$database_url"; then
        info "Database is already initialized and up to date"
        return 0
    fi
    
    # Check if this is a fresh database
    local has_tables=false
    if [[ "$database_url" == sqlite* ]]; then
        local db_file=$(echo "$database_url" | sed 's/sqlite:\/\/\///')
        if [ -f "$db_file" ]; then
            local table_count
            table_count=$(sqlite3 "$db_file" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
            if [ "$table_count" -gt 0 ]; then
                has_tables=true
            fi
        fi
    elif [[ "$database_url" == postgresql* ]]; then
        if command -v psql &> /dev/null; then
            local table_count
            table_count=$(psql "$database_url" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")
            if [ "$table_count" -gt 0 ]; then
                has_tables=true
            fi
        fi
    fi
    
    if [ "$has_tables" = true ]; then
        warning "Database has existing tables. This might be a partially initialized database."
        echo "Options:"
        echo "1) Run migrations anyway (recommended)"
        echo "2) Skip initialization"
        echo "3) Reset database (DANGEROUS - will delete all data)"
        read -p "Choose option (1-3): " choice
        
        case $choice in
            1)
                run_migrations "$database_url"
                ;;
            2)
                info "Skipping database initialization"
                return 0
                ;;
            3)
                warning "This will delete all data in the database!"
                read -p "Are you sure? Type 'yes' to confirm: " confirm
                if [ "$confirm" = "yes" ]; then
                    reset_database "$database_url"
                    run_migrations "$database_url"
                else
                    info "Database reset cancelled"
                    return 1
                fi
                ;;
            *)
                error "Invalid choice"
                return 1
                ;;
        esac
    else
        # Fresh database - run migrations
        run_migrations "$database_url"
    fi
}

# Reset database (drop all tables)
reset_database() {
    local database_url=$1
    
    warning "Resetting database - this will delete all data!"
    
    if [[ "$database_url" == sqlite* ]]; then
        local db_file=$(echo "$database_url" | sed 's/sqlite:\/\/\///')
        if [ -f "$db_file" ]; then
            rm "$db_file"
            success "SQLite database file deleted"
        fi
    elif [[ "$database_url" == postgresql* ]]; then
        if command -v psql &> /dev/null; then
            # Drop all tables in public schema
            psql "$database_url" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
            success "PostgreSQL database reset"
        else
            error "psql not available, cannot reset PostgreSQL database"
            return 1
        fi
    else
        error "Cannot reset unknown database type"
        return 1
    fi
}

# Create new migration
create_migration() {
    local message=$1
    
    if [ -z "$message" ]; then
        error "Migration message is required"
        return 1
    fi
    
    log "Creating new migration: $message"
    
    if [ ! -d "$ALEMBIC_DIR" ]; then
        error "Alembic directory not found: $ALEMBIC_DIR"
        return 1
    fi
    
    if ! command -v alembic &> /dev/null; then
        error "Alembic not installed"
        return 1
    fi
    
    alembic revision --autogenerate -m "$message"
    success "Migration created successfully"
}

# Rollback migration
rollback_migration() {
    local database_url=$1
    local target_revision=${2:-"-1"}
    
    log "Rolling back migration to $target_revision..."
    
    export DATABASE_URL="$database_url"
    
    # Create backup before rollback
    backup_database "$database_url" "pre_rollback_$(date +%Y%m%d_%H%M%S)"
    
    # Perform rollback
    alembic downgrade "$target_revision"
    success "Migration rollback completed"
}

# Show migration history
show_migration_history() {
    local database_url=$1
    
    export DATABASE_URL="$database_url"
    
    log "Migration history:"
    
    if [ -d "$ALEMBIC_DIR" ] && command -v alembic &> /dev/null; then
        alembic history --verbose
    else
        warning "Alembic not available"
    fi
}

# Validate migration files
validate_migrations() {
    log "Validating migration files..."
    
    if [ ! -d "$ALEMBIC_DIR/versions" ]; then
        warning "No migration files found"
        return 0
    fi
    
    local migration_count
    migration_count=$(find "$ALEMBIC_DIR/versions" -name "*.py" -not -name "__*" | wc -l)
    
    info "Found $migration_count migration files"
    
    # Check for syntax errors in migration files
    local errors=0
    for migration_file in "$ALEMBIC_DIR/versions"/*.py; do
        if [ -f "$migration_file" ]; then
            if ! python -m py_compile "$migration_file" 2>/dev/null; then
                error "Syntax error in migration file: $migration_file"
                errors=$((errors + 1))
            fi
        fi
    done
    
    if [ $errors -eq 0 ]; then
        success "All migration files are valid"
        return 0
    else
        error "$errors migration files have syntax errors"
        return 1
    fi
}

# Main function
main() {
    local action=""
    local database_url=""
    local message=""
    local target=""
    local env_file=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            init|initialize)
                action="init"
                shift
                ;;
            migrate|upgrade)
                action="migrate"
                shift
                ;;
            rollback|downgrade)
                action="rollback"
                shift
                ;;
            status)
                action="status"
                shift
                ;;
            history)
                action="history"
                shift
                ;;
            create)
                action="create"
                shift
                ;;
            reset)
                action="reset"
                shift
                ;;
            validate)
                action="validate"
                shift
                ;;
            backup)
                action="backup"
                shift
                ;;
            --database-url)
                database_url="$2"
                shift 2
                ;;
            --env-file)
                env_file="$2"
                shift 2
                ;;
            --message)
                message="$2"
                shift 2
                ;;
            --target)
                target="$2"
                shift 2
                ;;
            --help)
                echo "Database Migration Utility for Knowledge Assistant RAG"
                echo ""
                echo "Usage: $0 ACTION [OPTIONS]"
                echo ""
                echo "Actions:"
                echo "  init                   Initialize database with migrations"
                echo "  migrate                Run pending migrations"
                echo "  rollback               Rollback last migration"
                echo "  status                 Show current migration status"
                echo "  history                Show migration history"
                echo "  create                 Create new migration"
                echo "  reset                  Reset database (DANGEROUS)"
                echo "  validate               Validate migration files"
                echo "  backup                 Create database backup"
                echo ""
                echo "Options:"
                echo "  --database-url URL     Database connection URL"
                echo "  --env-file FILE        Environment file to load"
                echo "  --message MSG          Migration message (for create)"
                echo "  --target REV           Target revision (for migrate/rollback)"
                echo "  --help                 Show this help"
                echo ""
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    if [ -z "$action" ]; then
        error "Action is required. Use --help for usage information."
        exit 1
    fi
    
    # Load environment variables
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
        source "$env_file"
    elif [ -f ".env" ]; then
        source ".env"
    fi
    
    # Use DATABASE_URL from environment if not provided
    database_url=${database_url:-$DATABASE_URL}
    
    if [ -z "$database_url" ]; then
        error "Database URL is required. Set DATABASE_URL environment variable or use --database-url"
        exit 1
    fi
    
    log "Using database: $database_url"
    
    # Execute action
    case $action in
        init)
            initialize_database "$database_url"
            ;;
        migrate)
            run_migrations "$database_url" "${target:-head}"
            ;;
        rollback)
            rollback_migration "$database_url" "${target:--1}"
            ;;
        status)
            check_migration_status "$database_url"
            ;;
        history)
            show_migration_history "$database_url"
            ;;
        create)
            if [ -z "$message" ]; then
                error "Migration message is required for create action. Use --message"
                exit 1
            fi
            create_migration "$message"
            ;;
        reset)
            reset_database "$database_url"
            ;;
        validate)
            validate_migrations
            ;;
        backup)
            backup_database "$database_url"
            ;;
        *)
            error "Unknown action: $action"
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi