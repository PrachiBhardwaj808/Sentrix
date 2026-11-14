import sys
from pathlib import Path

# Ensure repository root is on sys.path so 'backend.*' imports resolve whether tests
# are launched from the repository root or from within the backend directory directly.
_repo_root = str(Path(__file__).resolve().parent.parent.parent)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
