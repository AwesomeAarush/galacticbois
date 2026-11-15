#!/usr/bin/env python3
"""Convert an OBJ (with optional per-vertex colors, as exported by trimesh) to a .glb
that the game can load with GLTFLoader.

    python3 tools/obj2glb.py assets/rover.obj assets/rover.glb

What it does:
  * reads v / vn / f, triangulating polygons;
  * keeps the per-vertex colors written as "v x y z r g b" and turns them into a
    COLOR_0 attribute (sRGB -> linear, which is what glTF expects);
  * flattens the mesh (one normal per face) so hard edges stay hard;
  * turns the model from Z-up (OBJ tools) to Y-up (glTF): (x,y,z) -> (x,z,-y);
  * centers it on the origin and scales its longest side to 2 units, so the game
    only has to pick a single scale factor.

No third-party packages. If the file has no faces (a vertex-only dump, for example
a truncated export) it stops with a clear message instead of writing an empty model.
"""
import json
import math
import struct
import sys


def read_obj(path):
    verts, faces, have_color = [], [], False
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if not line:
                continue
            tag = line[:2]
            if tag == "v ":
                p = line.split()
                if len(p) < 4:
                    continue
                x, y, z = float(p[1]), float(p[2]), float(p[3])
                if len(p) >= 7:
                    c = (float(p[4]), float(p[5]), float(p[6]))
                    have_color = True
                else:
                    c = (0.72, 0.72, 0.72)
                verts.append((x, y, z, c))
            elif tag == "f ":
                idx = []
                for part in line.split()[1:]:
                    v = part.split("/")[0]
                    if not v:
                        continue
                    i = int(v)
                    idx.append(i - 1 if i > 0 else len(verts) + i)
                for k in range(1, len(idx) - 1):
                    faces.append((idx[0], idx[k], idx[k + 1]))
    return verts, faces, have_color


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    verts, faces, have_color = read_obj(src)
    if not verts:
        print("no vertices in %s" % src)
        return 2
    if not faces:
        print("no faces in %s: %d vertices but not one 'f' line." % (src, len(verts)))
        print("This file looks truncated (a vertex-only dump). Export the mesh again with faces.")
        return 2

    # bounds (before the axis change, on the raw coordinates)
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    cx = (min(xs) + max(xs)) / 2.0
    cy = (min(ys) + max(ys)) / 2.0
    cz = (min(zs) + max(zs)) / 2.0
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) or 1.0
    k = 2.0 / span

    pos, nor, col, ind = [], [], [], []
    for (a, b, c) in faces:
        if a >= len(verts) or b >= len(verts) or c >= len(verts):
            continue
        pa, pb, pc = verts[a], verts[b], verts[c]
        # Z-up -> Y-up
        ax, ay, az = (pa[0] - cx) * k, (pa[2] - cz) * k, -(pa[1] - cy) * k
        bx, by, bz = (pb[0] - cx) * k, (pb[2] - cz) * k, -(pb[1] - cy) * k
        qx, qy, qz = (pc[0] - cx) * k, (pc[2] - cz) * k, -(pc[1] - cy) * k
        ux, uy, uz = bx - ax, by - ay, bz - az
        wx, wy, wz = qx - ax, qy - ay, qz - az
        nx, ny, nz = uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx
        ln = math.sqrt(nx * nx + ny * ny + nz * nz)
        if ln < 1e-12:
            continue
        nx, ny, nz = nx / ln, ny / ln, nz / ln
        base = len(pos)
        for p in (pa, pb, pc):
            pos.append(((p[0] - cx) * k, (p[2] - cz) * k, -(p[1] - cy) * k))
            nor.append((nx, ny, nz))
            r, g, b2 = p[3]
            col.append((r ** 2.2, g ** 2.2, b2 ** 2.2))
        ind.extend((base, base + 1, base + 2))

    if not ind:
        print("every face was degenerate; nothing to write")
        return 2

    pads = lambda n: (4 - n % 4) % 4
    pbytes = b"".join(struct.pack("<3f", *v) for v in pos)
    nbytes = b"".join(struct.pack("<3f", *v) for v in nor)
    cbytes = b"".join(struct.pack("<3f", *v) for v in col)
    ibytes = b"".join(struct.pack("<I", i) for i in ind)

    blobs, views, off = [], [], 0
    for data, target in ((pbytes, 34962), (nbytes, 34962), (cbytes, 34962), (ibytes, 34963)):
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        blobs.append(data)
        off += len(data) + pads(len(data))
    bin_chunk = b"".join(d + b"\0" * pads(len(d)) for d in blobs)

    def minmax(seq):
        return [min(v[i] for v in seq) for i in range(3)], [max(v[i] for v in seq) for i in range(3)]

    pmin, pmax = minmax(pos)
    gltf = {
        "asset": {"version": "2.0", "generator": "obj2glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "rover"}],
        "meshes": [{"name": "rover", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "materials": [{
            "name": "rover", "doubleSided": True,
            "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                                     "metallicFactor": 0.25, "roughnessFactor": 0.6}}],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": pmin, "max": pmax},
            {"bufferView": 1, "componentType": 5126, "count": len(nor), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(col), "type": "VEC3"},
            {"bufferView": 3, "componentType": 5125, "count": len(ind), "type": "SCALAR"},
        ],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * pads(len(js))
    total = 12 + 8 + len(js) + 8 + len(bin_chunk)
    with open(dst, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(struct.pack("<II", len(bin_chunk), 0x004E4942))
        fh.write(bin_chunk)

    size = max(pmax[i] - pmin[i] for i in range(3))
    print("wrote %s: %d triangles, %d vertices, %d colors, %.2f x %.2f x %.2f" % (
        dst, len(ind) // 3, len(pos), 1 if have_color else 0,
        pmax[0] - pmin[0], pmax[1] - pmin[1], pmax[2] - pmin[2]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
