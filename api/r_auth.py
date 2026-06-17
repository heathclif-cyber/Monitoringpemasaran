from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.auth import (
    create_access_token,
    get_current_user,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif",
        )
    token = create_access_token(user.id, user.username, user.role)
    return schemas.TokenResponse(
        access_token=token,
        user=schemas.UserOut.model_validate(user),
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
