import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ---------------------------------------------------------
# 1. Load Data (Reads from CSV or creates sample fallback)
# ---------------------------------------------------------
csv_filename = "prs.csv"

if not os.path.exists(csv_filename):
    raise "wtf"

df = pd.read_csv(csv_filename)

# To filter out non-members:
# df = df[df['authorAssociation'] != 'MEMBER'].copy()

# ---------------------------------------------------------
# 2. Parse Timestamps & Calculate Time to Merge
# ---------------------------------------------------------
df['createdAt'] = pd.to_datetime(df['createdAt'], utc=True, errors='coerce')
df['mergedAt'] = pd.to_datetime(df['mergedAt'], utc=True, errors='coerce')

# --- Date Filter ---
# Change this string to your desired cutoff date (YYYY-MM-DD)
cutoff_date = pd.to_datetime('2025-08-01', utc=True)
df = df[df['createdAt'] >= cutoff_date].copy()
df = df[df['createdAt'] < pd.to_datetime('2026-09-07', utc=True)].copy()

# Extract Year-Quarter (e.g., "2024Q1")
df['week'] = df['createdAt'].dt.to_period('W').astype(str)

# Compute duration in hours
df['duration_hours'] = (df['mergedAt'] - df['createdAt']).dt.total_seconds() / 3600.0

# ---------------------------------------------------------
# 3. Categorize into 4 Buckets
# ---------------------------------------------------------
def categorize_pr(row):
    if pd.isna(row['mergedAt']):
        return "Never closed"
    elif row['duration_hours'] <= 50:
        return "Closed in ≤ 50 hours"
    elif row['duration_hours'] <= 240:  # 10 days = 240 hours
        return "Closed in > 50 hours"
    else:
        return "Closed in > 10 days"

df['category'] = df.apply(categorize_pr, axis=1)

# Set category display order & colors
category_order = [
    "Closed in ≤ 50 hours",
    "Closed in > 50 hours",
    "Closed in > 10 days",
    "Never closed"
]

color_map = {
    "Closed in ≤ 50 hours": "#2ea44f",  # GitHub Green
    "Closed in > 50 hours": "#e3b341",  # Amber/Yellow
    "Closed in > 10 days": "#db6d28",   # Orange/Red
    "Never closed": "#8b949e"           # Muted Grey
}

# ---------------------------------------------------------
# 4. Group by Quarter and Category
# ---------------------------------------------------------
pivot_df = df.groupby(['week', 'category']).size().unstack(fill_value=0)

# Ensure all categories exist in the exact stack order
for cat in category_order:
    if cat not in pivot_df.columns:
        pivot_df[cat] = 0
pivot_df = pivot_df[category_order]

# ---------------------------------------------------------
# 5. Plot & Export SVG
# ---------------------------------------------------------
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
fig, ax = plt.subplots(figsize=(11, 6))

# Plot the stacked bars
colors = [color_map[cat] for cat in category_order]
pivot_df.plot(kind='bar', stacked=True, color=colors, ax=ax, width=0.7, edgecolor='none')

# --- Add Smoothed Average Line ---
# Total PRs per quarter
total_prs_per_quarter = pivot_df.sum(axis=1)
# Rolling average (2 quarters)
window_size = 6
smoothed_prs = total_prs_per_quarter.rolling(window=window_size, min_periods=1).mean()
# Plot the line over the bars
x_coords = range(len(pivot_df.index))
ax.plot(
    x_coords, 
    smoothed_prs, 
    color='#1f2328',       # Dark GitHub grey/black
    linewidth=2.5, 
    linestyle='-', 
    marker='o',            
    label=f'{window_size}-Week Moving Avg'
)

# --- Format X-Axis (Years Only) ---
# Set to 4 to show exactly one label per year (since there are 4 quarters)
step = 6 
# Extract just the first 4 characters (the year) from the index labels
year_labels = [label[:7] for label in pivot_df.index[::step]]
# Apply the ticks and the new year-only labels
ax.set_xticks(range(0, len(pivot_df.index), step))
ax.set_xticklabels(year_labels, rotation=0, ha='center') 

# Labels, Aesthetics & Legend
ax.set_title('Non-Member PRs Opened per Quarter by Merge Duration', fontsize=14, fontweight='bold', pad=15)
ax.set_xlabel('Month', fontsize=11, fontweight='bold', labelpad=10)
ax.set_ylabel('Number of PRs Opened', fontsize=11, fontweight='bold', labelpad=10)

# Grab all handles (bars + line) for the unified legend
handles, labels = ax.get_legend_handles_labels()
ax.legend(handles, labels, title='Category / Trend', bbox_to_anchor=(1.02, 1), loc='upper left', frameon=True)

plt.grid(axis='y', linestyle='--', alpha=0.5)
plt.tight_layout()

# Save as SVG
output_filename = "prs_per_quarter.svg"
plt.savefig(output_filename, format='svg')
print(f"Graph successfully generated and saved to '{output_filename}'")
