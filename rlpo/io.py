"""Atomic CSV writes: a WSL crash mid-write must not truncate a results file."""
import os


def save_csv(df, path):
    tmp = f"{path}.tmp"
    df.to_csv(tmp, index=False)
    os.replace(tmp, path)
