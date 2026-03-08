"""
Admin-only routes: verify spot, reject update, update/delete menu items, mark closed, delete spot.
All require X-Admin-Token header; use Supabase service role so RLS does not block.
"""
from fastapi import APIRouter, Depends, HTTPException

from dependencies import require_admin_token
from services.supabase_client import get_supabase_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin_token)])


@router.get("/me")
def admin_me():
    """Verify admin token; returns 200 if valid. Used by frontend guard."""
    return {"ok": True}


@router.post("/food-spots/{spot_id}/verify")
def verify_spot(spot_id: str):
    """Set menu_admin_verified_at on the food spot."""
    from datetime import datetime, timezone
    supabase = get_supabase_admin()
    result = (
        supabase.table("food_spots")
        .update({"menu_admin_verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
        .eq("id", spot_id)
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Spot not found or update had no effect.")
    return {"ok": True}


@router.patch("/food-spots/{spot_id}")
def update_food_spot(spot_id: str, body: dict):
    """Partial update (e.g. is_permanently_closed). Only allowed keys are applied."""
    allowed = {"is_permanently_closed"}
    payload = {k: v for k, v in body.items() if k in allowed}
    if not payload:
        raise HTTPException(status_code=400, detail="No allowed fields to update.")
    supabase = get_supabase_admin()
    result = supabase.table("food_spots").update(payload).eq("id", spot_id).execute()
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Spot not found.")
    return {"ok": True}


@router.delete("/food-spots/{spot_id}")
def delete_food_spot(spot_id: str):
    """Permanently delete a food spot (cascades to menu_items, menu_updates, etc.)."""
    supabase = get_supabase_admin()
    result = supabase.table("food_spots").delete().eq("id", spot_id).execute()
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Spot not found.")
    return {"ok": True}


@router.patch("/menu-items/{item_id}")
def update_menu_item(item_id: str, body: dict):
    """Update a single menu item (item_name, price, category, variant_name, description)."""
    allowed = {"item_name", "price", "category", "variant_name", "description"}
    payload = {k: v for k, v in body.items() if k in allowed}
    if not payload:
        raise HTTPException(status_code=400, detail="No allowed fields to update.")
    supabase = get_supabase_admin()
    result = supabase.table("menu_items").update(payload).eq("id", item_id).execute()
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    return {"ok": True}


@router.delete("/menu-items/{item_id}")
def delete_menu_item(item_id: str):
    """Delete a single menu item."""
    supabase = get_supabase_admin()
    result = supabase.table("menu_items").delete().eq("id", item_id).execute()
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    return {"ok": True}


@router.post("/menu-items/batch-update-category")
def batch_update_menu_item_category(body: dict):
    """Update category for multiple menu items. Body: { itemIds: string[], newCategory: string | null }."""
    item_ids = body.get("itemIds") or body.get("item_ids")
    new_category = body.get("newCategory") if "newCategory" in body else body.get("new_category")
    if not item_ids or not isinstance(item_ids, list):
        raise HTTPException(status_code=400, detail="itemIds array required.")
    if new_category is None or new_category == "":
        new_category = None
    else:
        new_category = str(new_category).strip() or None
    supabase = get_supabase_admin()
    for iid in item_ids:
        if isinstance(iid, str):
            supabase.table("menu_items").update({"category": new_category}).eq("id", iid).execute()
    return {"ok": True}


@router.delete("/menu-updates/{update_id}")
def delete_menu_update(update_id: str):
    """Delete a single menu_update row."""
    supabase = get_supabase_admin()
    result = supabase.table("menu_updates").delete().eq("id", update_id).execute()
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="Menu update not found.")
    return {"ok": True}


@router.post("/menu-updates/reject")
def reject_menu_updates(body: dict):
    """
    Reject a batch: delete menu_items by menu_update_id(s), then delete menu_updates.
    Body: { menuUpdateIds: string[] } or { batchId: string }.
    """
    supabase = get_supabase_admin()
    menu_update_ids = body.get("menuUpdateIds") or body.get("menu_update_ids")
    batch_id = body.get("batchId") or body.get("batch_id")

    if batch_id:
        # Fetch ids for this batch, then delete items by those ids, then delete updates by batch_id
        rows = supabase.table("menu_updates").select("id").eq("batch_id", batch_id).execute()
        menu_update_ids = [r["id"] for r in (rows.data or [])]
        if menu_update_ids:
            supabase.table("menu_items").delete().in_("menu_update_id", menu_update_ids).execute()
            supabase.table("menu_updates").delete().eq("batch_id", batch_id).execute()
        return {"ok": True}

    if not menu_update_ids or not isinstance(menu_update_ids, list):
        raise HTTPException(status_code=400, detail="menuUpdateIds array or batchId required.")
    supabase.table("menu_items").delete().in_("menu_update_id", menu_update_ids).execute()
    supabase.table("menu_updates").delete().in_("id", menu_update_ids).execute()
    return {"ok": True}
