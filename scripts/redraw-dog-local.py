#!/usr/bin/env python3
"""Compatibility entry point for the current golden-retriever sprite pipeline.

Use dog-differential.py directly for the full documented workflow. This legacy
command delegates to it so older handoff commands cannot restore obsolete art.
"""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('dog-differential.py')), run_name='__main__')
