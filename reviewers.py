import subprocess
import pandas as pd
import matplotlib.pyplot as plt

# 1. Fetch data from git
git_cmd = ['git', 'log', '--format=%cI|%(trailers:key=Reviewed-by,valueonly,separator=;)', '--since=2025-01-01']
output = subprocess.check_output(git_cmd, text=True).strip()

# 2. Parse the output
records = []
for line in output.split('\n'):
    if not line.strip(): 
        continue
        
    date_str, trailers = line.split('|', 1)
    count = len(trailers.split(';')) if trailers else 0
    records.append({'date': date_str, 'reviewed_by_count': count})

# 3. Create DataFrame and fix timezones
df = pd.DataFrame(records)
df['date'] = pd.to_datetime(df['date'], utc=True)
df.set_index('date', inplace=True)
df = df.sort_index()

# Filter to the last 12 months
# one_year_ago = df.index.max() - pd.DateOffset(months=12)
# df = df[df.index >= one_year_ago]

# 4. Group by week
# We use .agg() to calculate two different things simultaneously:
# - mean: the average number of reviewers per commit
# - size: the total number of commits that week
weekly_stats = df.resample('W').agg(
    reviewed_by_count=('reviewed_by_count', 'mean'),
    commit_count=('reviewed_by_count', 'size')
)

# Calculate 4-week rolling averages for both metrics
weekly_stats['rolling_avg_reviewers'] = weekly_stats['reviewed_by_count'].rolling(window=4, min_periods=1).mean()
weekly_stats['rolling_avg_commits'] = weekly_stats['commit_count'].rolling(window=4, min_periods=1).mean()

# 5. Plot the graph
fig, ax1 = plt.subplots(figsize=(12, 7))

# --- Left Axis: Reviewers (Blue) ---
ax1.plot(weekly_stats.index, weekly_stats['reviewed_by_count'], 
         marker='o', linestyle='-', color='#1f77b4', alpha=0.3, label='Weekly Avg Reviewers')
ax1.plot(weekly_stats.index, weekly_stats['rolling_avg_reviewers'], 
         linestyle='-', linewidth=3, color='#1f77b4', label='4-Week Trend (Reviewers)')

ax1.set_xlabel('Date')
ax1.set_ylabel('Average Reviewers per Commit', color='#1f77b4', fontweight='bold')
ax1.tick_params(axis='y', labelcolor='#1f77b4')
ax1.grid(True, linestyle='--', alpha=0.7)

# --- Right Axis: Commit Volume (Green) ---
ax2 = ax1.twinx()  # Create a second y-axis that shares the same x-axis

# Both commit lines are set to be slightly transparent (alpha 0.3 and 0.4)
ax2.plot(weekly_stats.index, weekly_stats['commit_count'], 
         marker='x', linestyle=':', color='#2ca02c', alpha=0.3, label='Weekly Commit Total')
ax2.plot(weekly_stats.index, weekly_stats['rolling_avg_commits'], 
         linestyle='--', linewidth=3, color='#2ca02c', alpha=0.4, label='4-Week Trend (Commits)')

ax2.set_ylabel('Total Commits per Week', color='#2ca02c', fontweight='bold')
ax2.tick_params(axis='y', labelcolor='#2ca02c')

# Combine the legends from both axes into a single box
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left')

plt.title('Average Reviewers per Commit')
# plt.xlabel('Date')
# plt.ylabel('Average Reviewers')
# plt.legend()
# plt.grid(True, linestyle='--', alpha=0.7)
plt.xlim(pd.to_datetime('2025-09-01', utc=True), pd.to_datetime('2026-09-07', utc=True))
plt.tight_layout()

# Save the plot or show it interactively
output_filename = "reviewers.svg"
plt.savefig(output_filename, format="svg")
print(f"Graph successfully saved to '{output_filename}'")
