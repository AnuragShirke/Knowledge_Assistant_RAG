#!/bin/bash

# Backup Manager Script
# Provides command-line interface for backup and restore operations

set -e

# Source deployment utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deployment-utils.sh"

# Configuration
BACKUP_DIR="backups"
DATABASE_FILE="knowledge_assistant.db"
PYTHON_CMD="python"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Function to create a backup
create_backup() {
    log "Starting backup creation..."
    
    local backup_id="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_id"
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Backup database
    if [ -f "$DATABASE_FILE" ]; then
        log "Backing up database..."
        cp "$DATABASE_FILE" "$backup_path/database.db"
        success "Database backup completed"
    else
        warning "Database file not found: $DATABASE_FILE"
    fi
    
    # Backup uploads directory
    if [ -d "uploads" ]; then
        log "Backing up uploads directory..."
        cp -r uploads "$backup_path/"
        success "Uploads backup completed"
    else
        warning "Uploads directory not found"
    fi
    
    # Create backup metadata
    cat > "$backup_path/metadata.json" << EOF
{
    "backup_id": "$backup_id",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_type": "manual",
    "created_by": "backup-manager.sh",
    "database_file": "$([ -f "$DATABASE_FILE" ] && echo "included" || echo "not_found")",
    "uploads_dir": "$([ -d "uploads" ] && echo "included" || echo "not_found")"
}
EOF
    
    # Create compressed archive
    log "Creating compressed archive..."
    cd "$BACKUP_DIR"
    tar -czf "${backup_id}.tar.gz" "$backup_id"
    rm -rf "$backup_id"
    cd - > /dev/null
    
    local backup_size=$(du -h "$BACKUP_DIR/${backup_id}.tar.gz" | cut -f1)
    success "Backup created successfully: ${backup_id}.tar.gz (${backup_size})"
    
    # Clean up old backups
    cleanup_old_backups
}

# Function to list available backups
list_backups() {
    log "Available backups:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.tar.gz 2>/dev/null)" ]; then
        warning "No backups found in $BACKUP_DIR"
        return
    fi
    
    printf "%-25s %-15s %-20s\n" "BACKUP ID" "SIZE" "DATE"
    printf "%-25s %-15s %-20s\n" "-------------------------" "---------------" "--------------------"
    
    for backup_file in "$BACKUP_DIR"/*.tar.gz; do
        if [ -f "$backup_file" ]; then
            local backup_name=$(basename "$backup_file" .tar.gz)
            local backup_size=$(du -h "$backup_file" | cut -f1)
            local backup_date=$(date -r "$backup_file" "+%Y-%m-%d %H:%M:%S")
            
            printf "%-25s %-15s %-20s\n" "$backup_name" "$backup_size" "$backup_date"
        fi
    done
}

# Function to restore from backup
restore_backup() {
    local backup_id="$1"
    
    if [ -z "$backup_id" ]; then
        error "Backup ID is required"
        echo "Usage: $0 restore <backup_id>"
        return 1
    fi
    
    local backup_file="$BACKUP_DIR/${backup_id}.tar.gz"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    log "Starting restore from backup: $backup_id"
    
    # Create temporary restore directory
    local restore_dir="$BACKUP_DIR/restore_${backup_id}"
    mkdir -p "$restore_dir"
    
    # Extract backup
    log "Extracting backup archive..."
    cd "$BACKUP_DIR"
    tar -xzf "${backup_id}.tar.gz" -C "$(dirname "$restore_dir")"
    cd - > /dev/null
    
    # Check if extraction was successful
    if [ ! -d "$BACKUP_DIR/$backup_id" ]; then
        error "Failed to extract backup archive"
        return 1
    fi
    
    # Backup current data before restore
    if [ -f "$DATABASE_FILE" ]; then
        local current_backup="$DATABASE_FILE.backup_$(date +%Y%m%d_%H%M%S)"
        cp "$DATABASE_FILE" "$current_backup"
        log "Current database backed up to: $current_backup"
    fi
    
    if [ -d "uploads" ]; then
        local current_uploads_backup="uploads_backup_$(date +%Y%m%d_%H%M%S)"
        cp -r uploads "$current_uploads_backup"
        log "Current uploads backed up to: $current_uploads_backup"
    fi
    
    # Restore database
    if [ -f "$BACKUP_DIR/$backup_id/database.db" ]; then
        log "Restoring database..."
        cp "$BACKUP_DIR/$backup_id/database.db" "$DATABASE_FILE"
        success "Database restored"
    else
        warning "No database found in backup"
    fi
    
    # Restore uploads
    if [ -d "$BACKUP_DIR/$backup_id/uploads" ]; then
        log "Restoring uploads directory..."
        rm -rf uploads
        cp -r "$BACKUP_DIR/$backup_id/uploads" .
        success "Uploads directory restored"
    else
        warning "No uploads directory found in backup"
    fi
    
    # Clean up temporary files
    rm -rf "$BACKUP_DIR/$backup_id"
    
    success "Restore completed successfully from backup: $backup_id"
}

# Function to verify backup integrity
verify_backup() {
    local backup_id="$1"
    
    if [ -z "$backup_id" ]; then
        error "Backup ID is required"
        echo "Usage: $0 verify <backup_id>"
        return 1
    fi
    
    local backup_file="$BACKUP_DIR/${backup_id}.tar.gz"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    log "Verifying backup integrity: $backup_id"
    
    # Test archive integrity
    if tar -tzf "$backup_file" > /dev/null 2>&1; then
        success "Backup archive integrity verified"
    else
        error "Backup archive is corrupted"
        return 1
    fi
    
    # Extract and verify contents
    local temp_dir=$(mktemp -d)
    cd "$temp_dir"
    
    if tar -xzf "$backup_file" 2>/dev/null; then
        log "Archive extracted successfully for verification"
        
        # Check for expected files
        local extracted_dir=$(ls -1 | head -1)
        
        if [ -f "$extracted_dir/metadata.json" ]; then
            log "Metadata file found"
            cat "$extracted_dir/metadata.json" | python -m json.tool > /dev/null 2>&1
            if [ $? -eq 0 ]; then
                success "Metadata is valid JSON"
            else
                warning "Metadata JSON is malformed"
            fi
        else
            warning "Metadata file not found"
        fi
        
        if [ -f "$extracted_dir/database.db" ]; then
            success "Database file found in backup"
        else
            warning "Database file not found in backup"
        fi
        
        success "Backup verification completed"
    else
        error "Failed to extract backup for verification"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 1
    fi
    
    cd - > /dev/null
    rm -rf "$temp_dir"
}

# Function to clean up old backups
cleanup_old_backups() {
    local max_backups=${1:-10}
    
    log "Cleaning up old backups (keeping last $max_backups)..."
    
    if [ ! -d "$BACKUP_DIR" ]; then
        return
    fi
    
    # Count current backups
    local backup_count=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$backup_count" -le "$max_backups" ]; then
        log "No cleanup needed ($backup_count backups, limit: $max_backups)"
        return
    fi
    
    # Remove oldest backups
    local to_remove=$((backup_count - max_backups))
    
    ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n "$to_remove" | while read -r old_backup; do
        log "Removing old backup: $(basename "$old_backup")"
        rm -f "$old_backup"
    done
    
    success "Cleaned up $to_remove old backups"
}

# Function to show backup statistics
show_stats() {
    log "Backup Statistics:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ]; then
        warning "Backup directory not found: $BACKUP_DIR"
        return
    fi
    
    local backup_count=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    
    echo "Total backups: $backup_count"
    echo "Total size: $total_size"
    echo "Backup directory: $BACKUP_DIR"
    
    if [ "$backup_count" -gt 0 ]; then
        echo ""
        local newest=$(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)
        local oldest=$(ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -1)
        
        if [ -n "$newest" ]; then
            echo "Newest backup: $(basename "$newest" .tar.gz) ($(date -r "$newest" "+%Y-%m-%d %H:%M:%S"))"
        fi
        
        if [ -n "$oldest" ] && [ "$oldest" != "$newest" ]; then
            echo "Oldest backup: $(basename "$oldest" .tar.gz) ($(date -r "$oldest" "+%Y-%m-%d %H:%M:%S"))"
        fi
    fi
}

# Function to schedule automatic backups
schedule_backup() {
    local schedule="$1"  # daily, weekly, or cron expression
    
    if [ -z "$schedule" ]; then
        error "Schedule is required"
        echo "Usage: $0 schedule <daily|weekly|'cron_expression'>"
        return 1
    fi
    
    local script_path="$(realpath "$0")"
    local cron_entry=""
    
    case "$schedule" in
        daily)
            cron_entry="0 2 * * * $script_path create"
            ;;
        weekly)
            cron_entry="0 2 * * 0 $script_path create"
            ;;
        *)
            cron_entry="$schedule $script_path create"
            ;;
    esac
    
    log "Adding cron job for automatic backups..."
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    
    success "Automatic backup scheduled: $schedule"
    log "Cron entry: $cron_entry"
}

# Main function
main() {
    case "${1:-help}" in
        create|backup)
            create_backup
            ;;
        list|ls)
            list_backups
            ;;
        restore)
            restore_backup "$2"
            ;;
        verify)
            verify_backup "$2"
            ;;
        cleanup)
            cleanup_old_backups "$2"
            ;;
        stats)
            show_stats
            ;;
        schedule)
            schedule_backup "$2"
            ;;
        help|--help|-h)
            echo "Backup Manager for Knowledge Assistant RAG"
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  create              Create a new backup"
            echo "  list                List all available backups"
            echo "  restore <backup_id> Restore from a specific backup"
            echo "  verify <backup_id>  Verify backup integrity"
            echo "  cleanup [count]     Clean up old backups (default: keep 10)"
            echo "  stats               Show backup statistics"
            echo "  schedule <schedule> Schedule automatic backups (daily/weekly/cron)"
            echo "  help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 create"
            echo "  $0 list"
            echo "  $0 restore backup_20240827_143022"
            echo "  $0 verify backup_20240827_143022"
            echo "  $0 cleanup 5"
            echo "  $0 schedule daily"
            echo ""
            ;;
        *)
            error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi