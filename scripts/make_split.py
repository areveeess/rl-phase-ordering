"""Family-grouped train / validation / held-out test split of cBench-v1 (DATA-01).

Near-duplicate programs (jpeg-c/jpeg-d, stringsearch/stringsearch2, the four tiff
tools) form one family and always land in the same split. Families are shuffled
with a fixed seed and assigned to test first, then validation, then train.
ghostscript (~400k instructions) is excluded from every split: measuring its
-O3 baseline crashed the whole WSL VM (8 GB RAM) twice, so it cannot be handled
on this machine. The exclusion is reported in the results.
"""
import json
import random

FAMILIES = {
    "adpcm": ["adpcm"], "bitcount": ["bitcount"], "blowfish": ["blowfish"], "bzip2": ["bzip2"],
    "crc32": ["crc32"], "dijkstra": ["dijkstra"], "gsm": ["gsm"], "ispell": ["ispell"],
    "jpeg": ["jpeg-c", "jpeg-d"], "lame": ["lame"], "patricia": ["patricia"], "qsort": ["qsort"],
    "rijndael": ["rijndael"], "sha": ["sha"], "stringsearch": ["stringsearch", "stringsearch2"],
    "susan": ["susan"], "tiff": ["tiff2bw", "tiff2rgba", "tiffdither", "tiffmedian"],
}
SEED = 0
N_TEST, N_VAL = 5, 3  # programs, filled family by family
EXCLUDED = {"ghostscript": "crashes the 8 GB WSL VM during baseline measurement"}

fams = sorted(FAMILIES)
random.Random(SEED).shuffle(fams)
split = {"test": [], "val": [], "train": []}
n_test = n_val = 0
for f in fams:
    progs = FAMILIES[f]
    if n_test < N_TEST:
        split["test"] += progs
        n_test += len(progs)
    elif n_val < N_VAL:
        split["val"] += progs
        n_val += len(progs)
    else:
        split["train"] += progs
for k in split:
    split[k].sort()
split["seed"] = SEED
split["excluded"] = EXCLUDED
split["families"] = FAMILIES
with open("splits/split.json", "w") as fh:
    json.dump(split, fh, indent=2)
for k in ("train", "val", "test"):
    print(k, len(split[k]), split[k])
