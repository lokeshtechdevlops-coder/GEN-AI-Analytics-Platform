"""
Data Service for reading KPIs from preprocessed Excel file with session caching.
"""
import os
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List, Optional
from api.utils.logger import get_logger

logger = get_logger("services.data_service")

class DataService:
    """Service to load and cache data from preprocessed Excel file."""
    
    _instance = None
    _cache = None
    _df = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DataService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Importing a router must not read application data or create cache files.
        pass
    
    def _load_data(self):
        """Load data from preprocessed Excel file."""
        try:
            from api.services.excel_dataset_service import excel_dataset_service
            self._df = excel_dataset_service.get_df()
            logger.info(f"Data loaded successfully from excel_dataset_service. Shape: {self._df.shape}")
        except Exception as e:
            logger.error(f"Error loading data from Excel: {e}")
            self._df = pd.DataFrame()
    
    def get_dataframe(self) -> pd.DataFrame:
        """Get the cached dataframe."""
        from api.services.excel_dataset_service import excel_dataset_service
        current = excel_dataset_service.get_df()
        from api.models.execution_context import current_selection
        if current_selection.get() is not None:
            return current
        if current is not self._df:
            self._df = current
            from api.services.schema_service import schema_service
            schema_service.refresh(current)
        return self._df
    
    def get_kpis(self) -> Dict[str, Any]:
        """Calculate KPIs from the cached data with weighted calculations."""
        df = self.get_dataframe()
        
        if df.empty:
            logger.warning("No data available, returning default KPIs")
            return {
                "total_revenue": 0,
                "total_quantity": 0,
                "avg_margin": 0,
                "country_count": 0
            }
        
        try:
            total_revenue = float(df["NetRevenueUSD"].sum()) if "NetRevenueUSD" in df.columns else 0.0
            total_quantity = int(df["Quantity"].sum()) if "Quantity" in df.columns else 0
            
            # Weighted Gross Margin Percentage = (Total Gross Margin USD / Total Net Revenue USD) * 100
            if "GrossMarginUSD" in df.columns and "NetRevenueUSD" in df.columns and total_revenue > 0:
                total_margin_usd = float(df["GrossMarginUSD"].sum())
                avg_margin = (total_margin_usd / total_revenue) * 100.0
            elif "GrossMarginPercent" in df.columns:
                avg_margin = float(df["GrossMarginPercent"].mean())
            else:
                avg_margin = 0.0

            # Valid non-empty active countries
            if "Country" in df.columns:
                clean_countries = df["Country"].dropna().astype(str).str.strip()
                clean_countries = clean_countries[clean_countries != ""]
                country_count = int(clean_countries.nunique())
            else:
                country_count = 0
            
            return {
                "total_revenue": total_revenue,
                "total_quantity": total_quantity,
                "avg_margin": float(avg_margin),
                "country_count": country_count
            }
        except Exception as e:
            logger.error(f"Error calculating KPIs: {e}")
            return {
                "total_revenue": 0,
                "total_quantity": 0,
                "avg_margin": 0,
                "country_count": 0
            }
    
    def get_revenue_trend(self) -> List[Dict[str, Any]]:
        """Get monthly revenue trend sorted strictly chronologically."""
        df = self.get_dataframe()
        
        if df.empty:
            return []
        
        try:
            has_revenue = "NetRevenueUSD" in df.columns
            has_profit = "GrossMarginUSD" in df.columns

            # Determine chronological sorting keys
            if "Year" in df.columns and "MonthNum" in df.columns and "MonthLabel" in df.columns:
                trend = df.groupby(["Year", "MonthNum", "MonthLabel"]).agg(
                    revenue=("NetRevenueUSD", "sum") if has_revenue else ("OrderID", "count"),
                    profit=("GrossMarginUSD", "sum") if has_profit else ("OrderID", "count")
                ).reset_index()
                trend = trend.sort_values(["Year", "MonthNum"])
            elif "OrderDate" in df.columns:
                temp_df = df.copy()
                temp_df["_OrderDate_dt"] = pd.to_datetime(temp_df["OrderDate"], errors="coerce")
                temp_df = temp_df.dropna(subset=["_OrderDate_dt"])
                temp_df["_YearMonth"] = temp_df["_OrderDate_dt"].dt.to_period("M")
                
                trend = temp_df.groupby(["_YearMonth", "MonthLabel" if "MonthLabel" in temp_df.columns else "_YearMonth"]).agg(
                    revenue=("NetRevenueUSD", "sum") if has_revenue else ("OrderID", "count"),
                    profit=("GrossMarginUSD", "sum") if has_profit else ("OrderID", "count")
                ).reset_index()
                trend = trend.sort_values("_YearMonth")
            elif "MonthLabel" in df.columns:
                trend = df.groupby("MonthLabel").agg(
                    revenue=("NetRevenueUSD", "sum") if has_revenue else ("OrderID", "count"),
                    profit=("GrossMarginUSD", "sum") if has_profit else ("OrderID", "count")
                ).reset_index()
            else:
                return []
            
            result = []
            for _, row in trend.iterrows():
                month_str = str(row["MonthLabel"]) if "MonthLabel" in row else str(row.get("_YearMonth", ""))
                result.append({
                    "month": month_str,
                    "revenue": float(row["revenue"]),
                    "profit": float(row["profit"])
                })
            
            return result
        except Exception as e:
            logger.error(f"Error getting revenue trend: {e}")
            return []
    
    def get_region_breakdown(self) -> List[Dict[str, Any]]:
        """Get revenue breakdown by region with safe percentage shares."""
        df = self.get_dataframe()
        
        if df.empty or "Region" not in df.columns:
            return []
        
        try:
            region_df = df.copy()
            region_df["Region"] = region_df["Region"].fillna("Unknown").astype(str).str.strip()
            
            region_data = region_df.groupby("Region").agg(
                revenue=("NetRevenueUSD", "sum") if "NetRevenueUSD" in df.columns else ("OrderID", "count")
            ).reset_index()
            
            total_revenue = region_data["revenue"].sum()
            if total_revenue > 0:
                region_data["share"] = (region_data["revenue"] / total_revenue * 100).round(1)
            else:
                region_data["share"] = 0.0
            
            result = []
            for _, row in region_data.iterrows():
                result.append({
                    "region": str(row["Region"]),
                    "revenue": float(row["revenue"]),
                    "share": float(row["share"])
                })
            
            return sorted(result, key=lambda x: x["revenue"], reverse=True)
        except Exception as e:
            logger.error(f"Error getting region breakdown: {e}")
            return []
    
    def get_country_breakdown(self) -> List[Dict[str, Any]]:
        """Get revenue breakdown by country."""
        df = self.get_dataframe()
        
        if df.empty or "Country" not in df.columns:
            return []
        
        try:
            country_df = df.copy()
            country_df["Country"] = country_df["Country"].fillna("Unknown").astype(str).str.strip()
            
            country_data = country_df.groupby("Country").agg(
                revenue=("NetRevenueUSD", "sum") if "NetRevenueUSD" in df.columns else ("OrderID", "count")
            ).reset_index()
            
            country_data = country_data.sort_values("revenue", ascending=False).head(10)
            
            result = []
            for _, row in country_data.iterrows():
                result.append({
                    "country": str(row["Country"]),
                    "revenue": float(row["revenue"])
                })
            
            return result
        except Exception as e:
            logger.error(f"Error getting country breakdown: {e}")
            return []
    
    def get_category_breakdown(self) -> List[Dict[str, Any]]:
        """Get revenue breakdown by category."""
        df = self.get_dataframe()
        
        if df.empty or "Category" not in df.columns:
            return []
        
        try:
            cat_df = df.copy()
            cat_df["Category"] = cat_df["Category"].fillna("Uncategorized").astype(str).str.strip()
            
            category_data = cat_df.groupby("Category").agg(
                revenue=("NetRevenueUSD", "sum") if "NetRevenueUSD" in df.columns else ("OrderID", "count")
            ).reset_index()
            
            category_data = category_data.sort_values("revenue", ascending=False)
            
            result = []
            for _, row in category_data.iterrows():
                result.append({
                    "category": str(row["Category"]),
                    "revenue": float(row["revenue"])
                })
            
            return result
        except Exception as e:
            logger.error(f"Error getting category breakdown: {e}")
            return []
    
    def get_quarterly_performance(self) -> List[Dict[str, Any]]:
        """Get quarterly performance (target vs actual)."""
        df = self.get_dataframe()
        
        if df.empty or "Year" not in df.columns or "Quarter" not in df.columns:
            return []
        
        try:
            quarterly = df.groupby(["Year", "Quarter"]).agg(
                actual=("NetRevenueUSD", "sum") if "NetRevenueUSD" in df.columns else ("OrderID", "count")
            ).reset_index()
            
            quarterly["quarter_label"] = quarterly["Year"].astype(str) + " " + quarterly["Quarter"].astype(str)
            quarterly = quarterly.sort_values(["Year", "Quarter"])
            
            # Set target as 90% of actual for visualization
            quarterly["target"] = (quarterly["actual"] * 0.9).round(0)
            
            result = []
            for _, row in quarterly.iterrows():
                result.append({
                    "quarter": str(row["quarter_label"]),
                    "target": float(row["target"]),
                    "actual": float(row["actual"])
                })
            
            return result
        except Exception as e:
            logger.error(f"Error getting quarterly performance: {e}")
            return []
    
    def get_top_products(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get top products by revenue."""
        df = self.get_dataframe()
        
        if df.empty or "ProductName" not in df.columns:
            return []
        
        try:
            prod_df = df.copy()
            prod_df["ProductName"] = prod_df["ProductName"].fillna("Unknown Product").astype(str).str.strip()
            group_cols = ["ProductName"]
            if "ProductID" in prod_df.columns:
                group_cols.insert(0, "ProductID")

            product_data = prod_df.groupby(group_cols).agg(
                units=("Quantity", "sum") if "Quantity" in df.columns else ("OrderID", "count"),
                revenue=("NetRevenueUSD", "sum") if "NetRevenueUSD" in df.columns else ("OrderID", "count")
            ).reset_index()
            
            product_data = product_data.sort_values("revenue", ascending=False)
            if limit is not None:
                product_data = product_data.head(limit)
            
            result = []
            for _, row in product_data.iterrows():
                result.append({
                    "product": str(row["ProductName"]),
                    "units": int(row["units"]),
                    "revenue": float(row["revenue"])
                })
            
            return result
        except Exception as e:
            logger.error(f"Error getting top products: {e}")
            return []
    
    def get_order_ids(self, limit: int = 100) -> List[str]:
        """Get list of OrderIDs."""
        df = self.get_dataframe()
        
        if df.empty:
            return []
        
        try:
            order_ids = df["OrderID"].unique()[:limit]
            return order_ids.tolist()
        except Exception as e:
            logger.error(f"Error getting order IDs: {e}")
            return []
    
    def get_order_details(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Get details for a specific order ID."""
        df = self.get_dataframe()
        
        if df.empty:
            return None
        
        try:
            order_data = df[df["OrderID"] == order_id]
            if order_data.empty:
                return None
            
            row = order_data.iloc[0]
            return row.to_dict()
        except Exception as e:
            logger.error(f"Error getting order details: {e}")
            return None


# Singleton instance
data_service = DataService()
