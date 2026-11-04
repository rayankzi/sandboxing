#!/usr/bin/env python3
"""Exact-arithmetic checker for linear-algebra claims in lecture notes.

Uses fractions only (no sympy needed). Run it on every matrix in the notes and
compare its output with what the notes (and the handwritten annotations) claim.

Usage:
  python3 linalg_check.py "[[1,4,0,4],[-3,-4,4,-2],[-2,0,4,2]]"
  python3 linalg_check.py "[[1,2],[2,4]]" --b "[4,8]"
  python3 linalg_check.py "[[-8,6],[4,-3]]" --combo "[[1/4,-1]]"   # checks A @ coeffs

Prints: RREF, pivot columns, rank, nullity, a nullspace basis, a column-space
basis (pivot columns of A), and, with --b, whether Ax=b is consistent plus one
particular solution.
"""
import argparse
import ast
from fractions import Fraction as F


def parse(s):
    def conv(x):
        if isinstance(x, list):
            return [conv(y) for y in x]
        return F(str(x))
    # allow fractions like 1/4 inside the literal
    s = s.replace(" ", "")
    tokens = ast.parse(s, mode="eval").body

    def ev(node):
        if isinstance(node, ast.List):
            return [ev(e) for e in node.elts]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            return ev(node.left) / ev(node.right)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -ev(node.operand)
        if isinstance(node, ast.Constant):
            return F(str(node.value))
        raise ValueError(f"unsupported token: {ast.dump(node)}")

    return ev(tokens)


def rref(M):
    A = [row[:] for row in M]
    m, n = len(A), len(A[0])
    pivots, r = [], 0
    for c in range(n):
        p = next((i for i in range(r, m) if A[i][c] != 0), None)
        if p is None:
            continue
        A[r], A[p] = A[p], A[r]
        pv = A[r][c]
        A[r] = [x / pv for x in A[r]]
        for i in range(m):
            if i != r and A[i][c] != 0:
                f = A[i][c]
                A[i] = [a - f * b for a, b in zip(A[i], A[r])]
        pivots.append(c)
        r += 1
        if r == m:
            break
    return A, pivots


def nullspace(R, pivots, n):
    free = [c for c in range(n) if c not in pivots]
    basis = []
    for f in free:
        v = [F(0)] * n
        v[f] = F(1)
        for row_i, pc in enumerate(pivots):
            v[pc] = -R[row_i][f]
        basis.append(v)
    return basis, free


def fmt(x):
    if isinstance(x, list):
        return "[" + ", ".join(fmt(y) for y in x) + "]"
    return str(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("matrix")
    ap.add_argument("--b", help="right-hand side vector, e.g. [4,8]")
    ap.add_argument("--combo", help="coefficient vectors to multiply A by, e.g. [[0,2],[4,0]]")
    a = ap.parse_args()
    A = parse(a.matrix)
    m, n = len(A), len(A[0])
    R, piv = rref(A)
    ns, free = nullspace(R, piv, n)
    print(f"shape: {m}x{n}")
    print("RREF:")
    for row in R:
        print("  " + fmt(row))
    print(f"pivot columns (1-based): {[p + 1 for p in piv]}")
    print(f"free columns  (1-based): {[f + 1 for f in free]}")
    print(f"rank = {len(piv)}   nullity = {len(ns)}   rank+nullity = {len(piv) + len(ns)} (n = {n})")
    print("row-space basis (nonzero RREF rows):")
    for row in R[: len(piv)]:
        print("  " + fmt(row))
    print("column-space basis (pivot columns of A):")
    for p in piv:
        print(f"  a{p + 1} = " + fmt([A[i][p] for i in range(m)]))
    print("nullspace basis:")
    for v in ns:
        print("  " + fmt(v))
    print("column dependency relations (non-pivot column = combo of pivot columns):")
    for f in free:
        terms = [f"({R[i][f]})*a{piv[i] + 1}" for i in range(len(piv)) if R[i][f] != 0]
        print(f"  a{f + 1} = " + (" + ".join(terms) if terms else "0"))
    if a.b:
        b = parse(a.b)
        aug = [A[i] + [b[i]] for i in range(m)]
        Ra, pa = rref(aug)
        consistent = n not in pa
        print(f"Ax=b with b={fmt(b)}: {'consistent' if consistent else 'INCONSISTENT'}")
        if consistent:
            x = [F(0)] * n
            for i, pc in enumerate(pa):
                x[pc] = Ra[i][n]
            print(f"  particular solution x = {fmt(x)}  ({'unique' if not free else 'infinitely many'})")
    if a.combo:
        for c in parse(a.combo):
            y = [sum(A[i][j] * c[j] for j in range(n)) for i in range(m)]
            print(f"A @ {fmt(c)} = {fmt(y)}")


if __name__ == "__main__":
    main()
