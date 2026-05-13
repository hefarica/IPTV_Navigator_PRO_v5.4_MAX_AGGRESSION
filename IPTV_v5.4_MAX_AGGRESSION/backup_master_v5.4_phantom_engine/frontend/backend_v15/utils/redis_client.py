#!/usr/bin/env python3
"""
APE v15.0 ULTIMATE - Redis Client Wrapper
Provides simplified interface for Redis operations with session management
"""

import redis
import json
import logging
from typing import Optional, Any, Dict

logger = logging.getLogger(__name__)


class RedisClient:
    """
    Redis client wrapper with convenience methods for APE v15
    """
    
    def __init__(self, host: str = 'localhost', port: int = 6379, db: int = 0):
        """
        Initialize Redis connection
        
        Args:
            host: Redis server hostname
            port: Redis server port
            db: Redis database number
        """
        self.host = host
        self.port = port
        self.db = db
        self._client = None
        self._connect()
    
    def _connect(self):
        """Establish Redis connection"""
        try:
            self._client = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5
            )
            self._client.ping()
            logger.info(f"✅ Connected to Redis at {self.host}:{self.port}")
        except redis.ConnectionError as e:
            logger.error(f"❌ Failed to connect to Redis: {e}")
            self._client = None
    
    def ping(self) -> bool:
        """Check if Redis is connected and responding"""
        if not self._client:
            return False
        try:
            return self._client.ping()
        except:
            return False
    
    def get(self, key: str) -> Optional[str]:
        """Get a value by key"""
        if not self._client:
            return None
        try:
            return self._client.get(key)
        except Exception as e:
            logger.error(f"Redis GET error: {e}")
            return None
    
    def set(self, key: str, value: str, ex: int = None) -> bool:
        """
        Set a value with optional expiration
        
        Args:
            key: Key name
            value: Value to store
            ex: Expiration in seconds (optional)
        """
        if not self._client:
            return False
        try:
            self._client.set(key, value, ex=ex)
            return True
        except Exception as e:
            logger.error(f"Redis SET error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete a key"""
        if not self._client:
            return False
        try:
            self._client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis DELETE error: {e}")
            return False
    
    def lpush(self, key: str, value: str) -> bool:
        """Push value to left of list"""
        if not self._client:
            return False
        try:
            self._client.lpush(key, value)
            return True
        except Exception as e:
            logger.error(f"Redis LPUSH error: {e}")
            return False
    
    def ltrim(self, key: str, start: int, end: int) -> bool:
        """Trim list to specified range"""
        if not self._client:
            return False
        try:
            self._client.ltrim(key, start, end)
            return True
        except Exception as e:
            logger.error(f"Redis LTRIM error: {e}")
            return False
    
    def lrange(self, key: str, start: int, end: int) -> list:
        """Get range of elements from list"""
        if not self._client:
            return []
        try:
            return self._client.lrange(key, start, end)
        except Exception as e:
            logger.error(f"Redis LRANGE error: {e}")
            return []
    
    def incr(self, key: str) -> int:
        """Increment a counter"""
        if not self._client:
            return 0
        try:
            return self._client.incr(key)
        except Exception as e:
            logger.error(f"Redis INCR error: {e}")
            return 0
    
    def get_json(self, key: str) -> Optional[Dict]:
        """Get and parse JSON value"""
        value = self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None
    
    def set_json(self, key: str, value: Dict, ex: int = None) -> bool:
        """Serialize and set JSON value"""
        try:
            return self.set(key, json.dumps(value), ex=ex)
        except Exception as e:
            logger.error(f"Redis SET JSON error: {e}")
            return False
    
    # Session-specific methods
    def get_session_profile(self, session_id: str) -> str:
        """Get profile for a session"""
        return self.get(f"session:{session_id}:profile") or "P2"
    
    def set_session_profile(self, session_id: str, profile: str) -> bool:
        """Set profile for a session"""
        return self.set(f"session:{session_id}:profile", profile)
    
    def get_session_channel(self, session_id: str) -> Optional[str]:
        """Get channel ID for a session"""
        return self.get(f"session:{session_id}:channel")
    
    def log_event(self, session_id: str, event: Dict) -> bool:
        """Log an event to session history"""
        key = f"events:{session_id}"
        result = self.lpush(key, json.dumps(event))
        # Keep last 100 events
        self.ltrim(key, 0, 99)
        return result
