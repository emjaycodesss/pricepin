"""
PricePin FastAPI app. CORS for frontend; routers for /process-menu etc.
Run: uvicorn main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PricePin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check for Render / load balancers."""
    return {"status": "ok"}


from routers import menu
app.include_router(menu.router)
