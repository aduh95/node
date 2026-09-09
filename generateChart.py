import json
import argparse
from datetime import datetime
import matplotlib.pyplot as plt

def parse_iso_date(date_str):
    """Parse GitHub's ISO 8601 timestamp."""
    return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")

def extract_release_data(json_data):
    """
    Extracts PRs and their commit counts from the JSON, 
    groups them by release line, and sorts them chronologically.
    """
    nodes = json_data.get("data", {}).get("repository", {}).get("pullRequests", {}).get("nodes", [])
    
    release_groups = {}
    
    for pr in nodes:
        closed_at = pr.get("closedAt")
        if not closed_at:
            continue
            
        labels = pr.get("labels", {}).get("nodes", [])
        # Extract the number of commits in this PR, defaulting to 0 if missing
        commit_count = pr.get("commits", {}).get("totalCount", 0)
        
        release_label = None
        for label in labels:
            name = label.get("name", "")
            if name.startswith("v") and name.endswith(".x"):
                release_label = name
                break
                
        if release_label:
            if release_label not in release_groups:
                release_groups[release_label] = []
            
            date = parse_iso_date(closed_at)
            # Store both the date and the number of commits
            release_groups[release_label].append((date, commit_count))
            
    # Sort chronologically by date (the first element of the tuple)
    for release in release_groups:
        release_groups[release].sort(key=lambda x: x[0])
        
    return release_groups

def generate_svg(release_groups, output_filename="cumulative_commits.svg"):
    """Generates a cumulative step plot aligned at t=0 for each release line."""
    plt.figure(figsize=(10, 6))
    
    for release, data_points in release_groups.items():
        if not data_points:
            continue
            
        # Align version x.0.0: Treat the earliest PR in the release line as the cutoff (t=0)
        t0 = data_points[0][0]
        
        relative_days = []
        cumulative_counts = []
        current_total = 0
        
        for date, commits in data_points:
            # Calculate relative time in days since the cutoff
            days = (date - t0).total_seconds() / (24 * 3600)
            relative_days.append(days)
            
            # Accumulate the total number of commits
            current_total += commits
            cumulative_counts.append(current_total)
        
        # Plot using a step plot
        plt.step(relative_days, cumulative_counts, label=release, where='post', linewidth=2)

    # NEW: Limit the x-axis to exactly 200 days
    plt.xlim(0, 200)

    # Formatting the graph
    plt.title("Cumulative Commits per Release Line (First 200 Days)", fontsize=14, pad=15)
    plt.xlabel("Days since semver cutoff ($t=0$)", fontsize=12)
    plt.ylabel("Cumulative Number of Commits", fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.7)
    plt.legend(title="Release Lines")
    plt.tight_layout()
    
    # Save as SVG
    plt.savefig(output_filename, format="svg")
    print(f"Graph successfully saved to '{output_filename}'")

def main():
    parser = argparse.ArgumentParser(description="Generate an SVG graph from GitHub PR JSON data.")
    parser.add_argument("input_file", help="Path to the JSON file containing PR data")
    parser.add_argument("-o", "--output", default="cumulative_commits.svg", help="Output SVG filename")
    args = parser.parse_args()

    # Load JSON
    try:
        with open(args.input_file, "r") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading JSON file: {e}")
        return

    # Process and Plot
    release_groups = extract_release_data(data)
    
    if not release_groups:
        print("No PRs with release line labels (e.g., 'v26.x') were found in the data.")
        return
        
    generate_svg(release_groups, args.output)

if __name__ == "__main__":
    main()
