import os

import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    secret = os.getenv("JWT_SECRET", "")
    if not secret or len(secret) < 32:
        raise HTTPException(status_code=500, detail="JWT_SECRET not configured")
    try:
        jwt.decode(credentials.credentials, secret, algorithms=["HS256"])
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e
    return credentials.credentials
