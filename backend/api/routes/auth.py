"""SAP login endpoints; every request validates its end-user access token."""
from typing import Optional
import requests
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from api.xsuaa import authenticated_profile, validate_token, user_profile, xsuaa_credentials

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class SSOLoginRequest(BaseModel):
    ias_token: Optional[str] = None
    universal_id_or_email: Optional[str] = None
    password_or_passcode: Optional[str] = None
    provider: Optional[str] = "sap_btp_ias"


class LoginRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    ias_token: Optional[str] = None
    rememberMe: Optional[bool] = True


def _login(token: str | None, username: str | None, password: str | None) -> dict:
    credentials = xsuaa_credentials()
    if not token:
        if not username or not password:
            raise HTTPException(401, "Sign in through SAP or provide a valid SAP end-user token.")
        if not all(credentials.get(key) for key in ("url", "clientid", "clientsecret")):
            raise HTTPException(503, "The project XSUAA login binding is not configured.")
        try:
            response = requests.post(
                credentials["url"].rstrip("/") + "/oauth/token",
                data={"grant_type": "password", "username": username, "password": password},
                auth=(credentials["clientid"], credentials["clientsecret"]), timeout=15,
            )
            if response.status_code in (400, 401, 403):
                raise HTTPException(401, "SAP rejected this login. Use the application router for SSO or MFA.")
            response.raise_for_status()
            token = response.json().get("access_token")
            if not isinstance(token, str) or not token:
                raise ValueError("Missing access token")
        except (requests.RequestException, ValueError):
            raise HTTPException(502, "SAP authentication is unavailable. Please retry.") from None
    context, claims = validate_token(token, credentials)
    return {"status": "success", "token": token, "user": user_profile(context, claims)}


@router.post("/sso")
def sso_login(req: SSOLoginRequest):
    token = req.ias_token
    if not token and req.password_or_passcode and req.password_or_passcode.count(".") == 2:
        token = req.password_or_passcode
    return _login(token, req.universal_id_or_email, req.password_or_passcode)


@router.post("/login")
def login(req: LoginRequest):
    return _login(req.ias_token, req.email, req.password)


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    return authenticated_profile(authorization)


@router.post("/logout")
def logout():
    # The browser clears its local token. AppRouter sessions end at /logout.
    return {"status": "success", "message": "Sign out through /logout to end the SAP router session."}
