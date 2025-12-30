import time
import os
from Tools.binarization.binarization import Binarization

SCRIPT_DIR = os.path.dirname(__file__)
TEST_IMG = os.path.join(SCRIPT_DIR, '..', 'bg_remove_ai', 'photo.jpg')
OUT_DIR = os.path.join(SCRIPT_DIR, 'out')
os.makedirs(OUT_DIR, exist_ok=True)

b = Binarization()

runs = 10
threshold = 128

times = []
for i in range(runs):
    out_path = os.path.join(OUT_DIR, f'binarized_{i}.png')
    t0 = time.perf_counter()
    b.add_binarization(TEST_IMG, out_path, threshold)
    t1 = time.perf_counter()
    times.append((t1 - t0) * 1000)

print(f"Runs: {runs}, times(ms): {times}")
print(f"Avg: {sum(times)/len(times):.2f} ms, Min: {min(times):.2f} ms, Max: {max(times):.2f} ms")