#!/usr/bin/env python3
"""
APE v15.0 ULTIMATE - Structured Logger
"""

import logging
import os
from datetime import datetime

def setup_logger(name: str, log_file: str = None, level=logging.INFO) -> logging.Logger:
    """
    Creates a structured logger with console and file handlers
    
    Args:
        name: Logger name (usually module name)
        log_file: Optional path to log file
        level: Logging level
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Clear existing handlers
    logger.handlers = []
    
    # Format: timestamp - level - name - message
    formatter = logging.Formatter(
        '%(asctime)s - APE-v15 - %(levelname)s - %(name)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler (if specified)
    if log_file:
        # Ensure log directory exists
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


class ColoredConsoleHandler(logging.StreamHandler):
    """Console handler with colored output for different log levels"""
    
    COLORS = {
        'DEBUG': '\033[36m',    # Cyan
        'INFO': '\033[32m',     # Green
        'WARNING': '\033[33m',  # Yellow
        'ERROR': '\033[31m',    # Red
        'CRITICAL': '\033[35m', # Magenta
    }
    RESET = '\033[0m'
    
    def emit(self, record):
        try:
            color = self.COLORS.get(record.levelname, self.RESET)
            record.msg = f"{color}{record.msg}{self.RESET}"
            super().emit(record)
        except Exception:
            self.handleError(record)
