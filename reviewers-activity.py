import subprocess
import pandas as pd
import matplotlib.pyplot as plt

# 1. Fetch data from git
git_cmd = ['git', 'log', '--format=%cI|%(trailers:key=Reviewed-by,valueonly,separator=;)', '--after=2025-09-01']
output = subprocess.check_output(git_cmd, text=True).strip()

# 2. Parse the output to track reviewed vs unreviewed commits
commit_records = []
review_records = []

for line in output.split('\n'):
    if not line.strip() or '|' not in line: 
        continue
        
    date_str, trailers = line.split('|', 1)
    
    # Record every single commit to establish our denominator
    commit_records.append({'date': date_str})
    
    # Record individual reviewers for the numerators
    if trailers:
        # We use a set() here just in case someone accidentally added 
        # the same Reviewed-by line twice on a single commit
        reviewers = set([r.strip() for r in trailers.split(';') if r.strip()])
        for reviewer in reviewers:
            review_records.append({'date': date_str, 'reviewer': reviewer})

# 3. Create DataFrames and fix timezones
df_commits = pd.DataFrame(commit_records)
df_reviews = pd.DataFrame(review_records)

if df_commits.empty:
    print("No commits found.")
    exit()

df_commits['date'] = pd.to_datetime(df_commits['date'], utc=True)
if not df_reviews.empty:
    df_reviews['date'] = pd.to_datetime(df_reviews['date'], utc=True)

# Filter to the last 12 months based on the newest commit
# one_year_ago = df_commits['date'].max() - pd.DateOffset(months=12)
# df_commits = df_commits[df_commits['date'] >= one_year_ago]
# if not df_reviews.empty:
#     df_reviews = df_reviews[df_reviews['date'] >= one_year_ago]

# 4. Process Total Commits (Denominator)
df_commits.set_index('date', inplace=True)
weekly_commits = df_commits.resample('W').size()

# We need the rolling sum for the percentage math, and the average for the background graph
rolling_commits_sum = weekly_commits.rolling(window=4, min_periods=1).sum()
rolling_commits_avg = weekly_commits.rolling(window=4, min_periods=1).mean()

# 5. Process Reviews (Numerators for Top 10)
if not df_reviews.empty:
    top_10_reviewers = df_reviews['reviewer'].value_counts().nlargest(5).index
    df_top10 = df_reviews[df_reviews['reviewer'].isin(top_10_reviewers)]
    
    # Group by week and reviewer
    weekly_reviews = df_top10.groupby([pd.Grouper(key='date', freq='W'), 'reviewer']).size().unstack(fill_value=0)
    # Ensure it aligns perfectly with the weekly_commits timeline (including empty weeks)
    weekly_reviews = weekly_reviews.reindex(weekly_commits.index, fill_value=0)
    
    # 4-week rolling sum of reviews for each person
    rolling_reviews_sum = weekly_reviews.rolling(window=4, min_periods=1).sum()
    
    # 6. Calculate the Percentage
    # Divide each person's rolling review sum by the rolling total commits sum
    rolling_percent = rolling_reviews_sum.div(rolling_commits_sum, axis='index') * 100
else:
    rolling_percent = pd.DataFrame(index=weekly_commits.index) # Empty fallback

# 7. Plot the graph
fig, ax1 = plt.subplots(figsize=(12, 7))

# --- Primary Axis: Reviewer Percentages ---
if not rolling_percent.empty:
    for reviewer in rolling_percent.columns:
        ax1.plot(rolling_percent.index, rolling_percent[reviewer], linewidth=2, label=reviewer)

ax1.set_title('Top 10 Reviewers: Proportion of Total Commits Reviewed (Last 12 Months)')
ax1.set_xlabel('Date')
ax1.set_ylabel('% of Total Commits Reviewed', fontweight='bold')
ax1.grid(True, linestyle='--', alpha=0.7)

# Cap the Y-axis at 100% (or whatever max is appropriate, but 105 gives breathing room)
ax1.set_ylim(0, 105)

# Move reviewer legend outside the plot
ax1.legend(title='Top 10 Reviewers', bbox_to_anchor=(1.02, 1), loc='upper left')

# --- Secondary Axis: Total Commit Volume ---
ax2 = ax1.twinx()

# Plot the commit volume as a thick, semi-transparent grey dashed line
ax2.plot(rolling_commits_avg.index, rolling_commits_avg, 
         linestyle='--', linewidth=6, color='grey', alpha=0.25, label='Total Commits (4-Wk Avg)')

ax2.set_ylabel('Total Commits per Week', color='grey', fontweight='bold')
ax2.tick_params(axis='y', labelcolor='grey')
ax2.set_ylim(bottom=0)

# Add the commit legend below the reviewer legend
ax2.legend(bbox_to_anchor=(1.02, 0.4), loc='upper left')

plt.tight_layout()

# Save as SVG
output_filename = "reviewers-activity.svg"
plt.savefig(output_filename, format='svg')
print(f"Graph successfully generated and saved to '{output_filename}'")
