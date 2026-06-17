from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import get_db
from services.auth import hash_password, require_admin

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if body.role not in ("admin", "staff", "tamu"):
        raise HTTPException(status_code=400, detail="Role tidak valid (admin/staff/tamu)")
    existing = db.query(models.User).filter(models.User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username sudah digunakan")
    user = models.User(
        username=body.username,
        hashed_password=hash_password(body.password),
        nama_lengkap=body.nama_lengkap,
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    body: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if body.role is not None and body.role not in ("admin", "staff", "tamu"):
        raise HTTPException(status_code=400, detail="Role tidak valid (admin/staff/tamu)")
    if body.nama_lengkap is not None:
        user.nama_lengkap = body.nama_lengkap
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=schemas.UserOut)
def reset_password(
    user_id: int,
    body: schemas.PasswordReset,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(require_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    db.delete(user)
    db.commit()
