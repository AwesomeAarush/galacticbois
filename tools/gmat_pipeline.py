#!/usr/bin/env python3
"""Make js/gmat_data.js with NASA GMAT (General Mission Analysis Tool).

Everything the game draws for the Earth-to-Mars flight comes from GMAT runs made by this script:
  1. Earth and Mars positions for every day of the game's calendar (GMAT, DE421 planetary ephemeris).
  2. For every launch day inside the game's launch windows, an Earth-to-Mars transfer that GMAT's
     differential corrector targets so that it reaches Mars, then propagates in 2-day steps.

GMAT runs as a console program. On Windows run this script with Python next to a GMAT install; on Linux
or macOS it runs the Windows build through Wine:

    python3 tools/gmat_pipeline.py --gmat /path/to/GMAT/bin  [--wine /usr/lib/wine/wine64]

Model, stated plainly:
  * heliocentric frame (Sun-centred, mean ecliptic of J2000), DE421 ephemeris;
  * forces: point-mass gravity of the Sun, Venus, Jupiter and Saturn, Runge-Kutta 8(9) integrator;
  * departure from Earth's centre and arrival at Mars's centre (patched conic): the escape from Earth and
    the capture at Mars are not part of these runs, which is why Earth and Mars gravity are left out;
  * the flight time for each launch day comes from the game's route rule (QEph.route here, GM.route in
    js/game.js): a transfer orbit with its perihelion at Earth's launch-day position and its aphelion at
    Mars's actual distance (Hohmann) or 2.4% beyond it (fast route). That rule varies smoothly with the
    launch day, so arrival dates never jump, and it is computed from the same rounded positions the game
    uses, so both agree on the launch windows;
  * GMAT's differential corrector then aims each in-window transfer at Mars's position on arrival day in
    the ecliptic plane (varying the in-plane departure velocity). Mars's orbit is tilted 1.85 degrees, so
    the craft passes up to a few million km above or below Mars; real near-180-degree transfers fix that
    with a mid-course plane change. Aiming in the plane avoids the singular plane change of an exact
    half-orbit transfer and the switching between short-way and long-way transfers from day to day.
"""
import argparse, base64, json, math, os, struct, subprocess, sys, datetime

MU = 1.32712440018e11            # km^3/s^2, Sun
AU = 1.495978707e8               # km
RM = 1.5237
HORIZON = 1560
BASE = datetime.datetime(2028, 6, 1)
GMAT_MJD0 = 2430000.0            # GMAT's modified Julian date is JD - 2430000
TR = {'hohmann': RM, 'fast': 1.56}
EPH_PRE, EPH_POST = 10, 340      # days of ephemeris before day 0 and after the horizon

def jd_of(dt): return 2440587.5 + (dt - datetime.datetime(1970, 1, 1)).total_seconds() / 86400.0
MJD_BASE = jd_of(BASE) - GMAT_MJD0

def transfer(Q):
    """The game's transfer ellipse (js/game.js transfer()): flight time T in days and arrival angle nu."""
    a = (1 + Q) / 2; e = (Q - 1) / (Q + 1); p = a * (1 - e * e)
    nu = math.acos(max(-1, min(1, (p / RM - 1) / e)))
    E = 2 * math.atan(math.sqrt((1 - e) / (1 + e)) * math.tan(nu / 2))
    P = 365.25636 * a ** 1.5
    return {'T': (E - e * math.sin(E)) / (2 * math.pi) * P, 'nu': nu}

class Runner:
    def __init__(self, gmat_bin, wine, work):
        self.bin, self.wine, self.work = gmat_bin, wine, work
        os.makedirs(work, exist_ok=True)
    def winpath(self, p):
        p = os.path.abspath(p)
        return p if os.name == 'nt' else 'Z:' + p.replace('/', '\\')
    def run(self, name, text):
        sp = os.path.join(self.work, name + '.script')
        open(sp, 'w').write(text)
        exe = os.path.join(self.bin, 'GmatConsole.exe')
        cmd = ([exe] if os.name == 'nt' else [self.wine, exe]) + ['--run', self.winpath(sp)]
        env = dict(os.environ, WINEDEBUG='-all')
        r = subprocess.run(cmd, cwd=self.bin, env=env, capture_output=True, text=True, timeout=3600)
        if 'successful' not in r.stdout:
            sys.exit('GMAT run %s failed:\n%s' % (name, r.stdout[-3000:]))

HEAD = """Create CoordinateSystem SunEc;
GMAT SunEc.Origin = Sun;
GMAT SunEc.Axes = MJ2000Ec;
GMAT SolarSystem.EphemerisSource = 'DE421';
Create ForceModel fm;
GMAT fm.CentralBody = Sun;
GMAT fm.PointMasses = {Sun, Venus, Jupiter, Saturn};
Create Propagator prop;
GMAT prop.FM = fm;
GMAT prop.Type = RungeKutta89;
GMAT prop.InitialStepSize = 86400;
GMAT prop.Accuracy = 1e-11;
GMAT prop.MinStep = 1;
GMAT prop.MaxStep = 2000000;
"""
def sc_block(name, mjd, r, v):
    return f"""Create Spacecraft {name};
GMAT {name}.DateFormat = UTCModJulian;
GMAT {name}.Epoch = '{mjd:.6f}';
GMAT {name}.CoordinateSystem = SunEc;
GMAT {name}.DisplayStateType = Cartesian;
GMAT {name}.X = {r[0]:.6f};
GMAT {name}.Y = {r[1]:.6f};
GMAT {name}.Z = {r[2]:.6f};
GMAT {name}.VX = {v[0]:.9f};
GMAT {name}.VY = {v[1]:.9f};
GMAT {name}.VZ = {v[2]:.9f};
"""
def report_file(name, path):
    return f"""Create ReportFile {name};
GMAT {name}.Filename = '{path}';
GMAT {name}.WriteHeaders = false;
GMAT {name}.Precision = 14;
"""
def read_rows(path):
    return [[float(x) for x in l.split()] for l in open(path) if l.strip()]

# ---------- 1. ephemeris ----------
def ephemeris(R):
    n = EPH_PRE + HORIZON + EPH_POST
    out = os.path.join(R.work, 'eph.txt')
    s = HEAD + sc_block('clock', MJD_BASE - EPH_PRE, (AU, 0, 0), (0, 29.78, 0)) + report_file('rep', R.winpath(out)) + \
        "Create Variable k;\nBeginMissionSequence;\n" + \
        "Report rep clock.UTCModJulian Earth.SunEc.X Earth.SunEc.Y Earth.SunEc.Z Earth.SunEc.VX Earth.SunEc.VY Earth.SunEc.VZ Mars.SunEc.X Mars.SunEc.Y Mars.SunEc.Z Mars.SunEc.VX Mars.SunEc.VY Mars.SunEc.VZ;\n" + \
        f"While k < {n}\n  Propagate prop(clock) {{clock.ElapsedDays = 1}};\n" + \
        "  Report rep clock.UTCModJulian Earth.SunEc.X Earth.SunEc.Y Earth.SunEc.Z Earth.SunEc.VX Earth.SunEc.VY Earth.SunEc.VZ Mars.SunEc.X Mars.SunEc.Y Mars.SunEc.Z Mars.SunEc.VX Mars.SunEc.VY Mars.SunEc.VZ;\n" + \
        "  GMAT k = k + 1;\nEndWhile;\n"
    R.run('eph', s)
    rows = read_rows(out)
    # the clock spacecraft drifts in time only by whole days; check the epochs are exact
    for i, r in enumerate(rows):
        assert abs(r[0] - (MJD_BASE - EPH_PRE + i)) < 1e-6, (i, r[0])
    return rows

class Eph:
    def __init__(self, rows): self.rows = rows
    def at(self, d, body):       # d = game day (may be fractional); body 0 Earth, 1 Mars -> (pos, vel) km, km/s
        x = d + EPH_PRE; i = int(math.floor(x)); f = x - i; a, b = self.rows[i], self.rows[i + 1]; o = 1 + 6 * body
        return [a[o + j] + (b[o + j] - a[o + j]) * f for j in range(3)], [a[o + 3 + j] + (b[o + 3 + j] - a[o + 3 + j]) * f for j in range(3)]
    def lon(self, d, body):
        p, _ = self.at(d, body); return math.degrees(math.atan2(p[1], p[0]))

def wrap(a): return ((a + 180) % 360 + 360) % 360 - 180

# ---------- Lambert's problem (two-body starting guess), universal variables, prograde ----------
def stumpff(z):
    if z > 1e-8: s = math.sqrt(z); return (1 - math.cos(s)) / z, (s - math.sin(s)) / s ** 3
    if z < -1e-8: s = math.sqrt(-z); return (math.cosh(s) - 1) / -z, (math.sinh(s) - s) / s ** 3
    return 0.5, 1 / 6
def lambert(r1, r2, dt):
    n1, n2 = math.sqrt(sum(c * c for c in r1)), math.sqrt(sum(c * c for c in r2))
    cz = r1[0] * r2[1] - r1[1] * r2[0]
    dth = math.acos(max(-1, min(1, sum(a * b for a, b in zip(r1, r2)) / (n1 * n2))))
    if cz < 0: dth = 2 * math.pi - dth
    A = math.sin(dth) * math.sqrt(n1 * n2 / (1 - math.cos(dth)))
    def F(z):
        C, Sz = stumpff(z); y = n1 + n2 + A * (z * Sz - 1) / math.sqrt(C)
        if y < 0: return None, y
        return (y / C) ** 1.5 * Sz + A * math.sqrt(y) - math.sqrt(MU) * dt, y
    lo, hi = -4 * math.pi ** 2, 4 * math.pi ** 2 * 0.999
    while F(lo)[0] is None: lo += 0.1
    for _ in range(200):
        mid = (lo + hi) / 2; f, _ = F(mid)
        if f is None or f > 0: hi = mid
        else: lo = mid
    z = (lo + hi) / 2; C, Sz = stumpff(z); y = n1 + n2 + A * (z * Sz - 1) / math.sqrt(C)
    f = 1 - y / n1; g = A * math.sqrt(y / MU); gd = 1 - y / n2
    v1 = [(r2[i] - f * r1[i]) / g for i in range(3)]; v2 = [(gd * r2[i] - r1[i]) / g for i in range(3)]
    return v1, v2, math.degrees(dth)

def norm(v): return math.sqrt(sum(c * c for c in v))

# ---------- the route rule, shared with js/game.js (GM.route) ----------
# Both sides compute the route from the same rounded ephemeris (1e-4 AU, the numbers shipped in gmat_data.js),
# so the game and this script agree on flight times and launch windows to the day.
class QEph:
    def __init__(self, E):
        self.rows = []
        for r in E.rows:
            self.rows.append([q(r[o + j] / AU, 1e4) * 1e-4 for o in (1, 7) for j in range(3)])
        n = len(self.rows)
        tab = []
        for i in range(min(691, n)):
            x, y, _ = self.pos(-EPH_PRE + i, 1); tab.append((math.atan2(y, x), math.hypot(x, y)))
        tab.sort(); self.mtab = tab
    def pos(self, d, b):        # same clamping and linear interpolation as GM.pos in js/game.js
        n = len(self.rows); x = max(0, min(n - 1.001, d + EPH_PRE)); i = int(math.floor(x)); f = x - i
        a, c = self.rows[i], self.rows[i + 1]; o = 3 * b
        return [a[o + j] + (c[o + j] - a[o + j]) * f for j in range(3)]
    def lon(self, d, b):
        p = self.pos(d, b); return math.degrees(math.atan2(p[1], p[0]))
    def rmars(self, lam):       # Mars's distance from the Sun (ecliptic plane) at heliocentric longitude lam
        T = self.mtab; lam = (lam + math.pi) % (2 * math.pi) - math.pi
        lo, hi = 0, len(T)
        while lo < hi:
            m = (lo + hi) // 2
            if T[m][0] < lam: lo = m + 1
            else: hi = m
        a = T[(lo - 1) % len(T)]; b = T[lo % len(T)]
        la, lb = a[0], b[0]
        if lb <= la: lb += 2 * math.pi
        l = lam if lam >= la else lam + 2 * math.pi
        f = 0 if lb == la else (l - la) / (lb - la)
        return a[1] + (b[1] - a[1]) * f
    def route(self, d, ratio):
        """The game's route on launch day d: leave Earth's actual position on a transfer orbit whose perihelion is
        there and whose aphelion is ratio x Mars's actual distance at the arrival longitude (ratio 1 = Hohmann)."""
        e1 = self.pos(d, 0); r1 = math.hypot(e1[0], e1[1]); l1 = math.atan2(e1[1], e1[0]); nu = math.pi
        for _ in range(12):
            r2 = self.rmars(l1 + nu); Q = r2 * ratio; a = (r1 + Q) / 2; e = (Q - r1) / (Q + r1); p = a * (1 - e * e)
            nn = math.pi if ratio <= 1.0000001 else math.acos(max(-1, min(1, (p / r2 - 1) / e)))
            if abs(nn - nu) < 1e-10: nu = nn; break
            nu = nn
        r2 = self.rmars(l1 + nu); Q = r2 * ratio; a = (r1 + Q) / 2; e = (Q - r1) / (Q + r1); p = a * (1 - e * e)
        E_ = 2 * math.atan2(math.sqrt(1 - e) * math.sin(nu / 2), math.sqrt(1 + e) * math.cos(nu / 2))
        P = 2 * math.pi * math.sqrt((a * AU) ** 3 / MU) / 86400
        T = (E_ - e * math.sin(E_)) / (2 * math.pi) * P
        return {'r1': r1, 'l1': l1, 'nu': nu, 'r2': r2, 'a': a, 'e': e, 'p': p, 'P': P, 'T': T, 'lA': l1 + nu}

def plan_cases(E, QE):
    cases = []
    for key, Q in TR.items():
        ratio = Q / RM
        routes = {d: QE.route(d, ratio) for d in range(HORIZON + 1)}
        miss = {d: wrap(QE.lon(d + routes[d]['T'], 1) - math.degrees(routes[d]['lA'])) for d in routes}
        open_days = [d for d in routes if abs(miss[d]) <= 10]
        days = sorted(set(x for d in open_days for x in range(d - 4, d + 5) if 0 <= x <= HORIZON))
        for d in days:
            rt = routes[d]; r1, ve = E.at(d, 0)
            # starting guess: the route's own departure velocity, prograde and perpendicular to the Sun line, in the ecliptic
            rk = math.hypot(r1[0], r1[1]); v = math.sqrt(MU * (2 / rk - 1 / (rt['a'] * AU)))
            guess = [-r1[1] / rk * v, r1[0] / rk * v, ve[2]]
            cases.append({'type': key, 'd': d, 'tof': round(rt['T'], 4), 'guess': guess, 'r1': r1, 've': ve,
                          'dth': round(math.degrees(rt['nu']) + miss[d], 1), 'routeMiss': miss[d]})
        Ts = [routes[d]['T'] for d in open_days]
        print(key, 'route flight time %.1f-%.1f d over the horizon, %d open days, %d cases' %
              (min(r['T'] for r in routes.values()), max(r['T'] for r in routes.values()), len(open_days), len([c for c in cases if c['type'] == key])))
    return cases

# ---------- 2. GMAT targets each transfer to reach Mars ----------
def target(R, cases):
    out = os.path.join(R.work, 'target.txt')
    s = HEAD + "Create DifferentialCorrector DC;\nGMAT DC.MaximumIterations = 40;\nGMAT DC.DerivativeMethod = ForwardDifference;\n" + \
        "Create Variable vx vy vz dX dY dZ;\n" + report_file('rep', R.winpath(out))
    for i, c in enumerate(cases):
        s += sc_block('s%d' % i, MJD_BASE + c['d'], c['r1'], c['guess'])
    s += "BeginMissionSequence;\n"
    for i, c in enumerate(cases):
        n = 's%d' % i; g = c['guess']
        s += f"""Target DC {{SolveMode = Solve, ExitMode = SaveAndContinue}};
  Vary DC(vx = {g[0]:.9f}, {{Perturbation = 0.00001, MaxStep = 0.3, Lower = -80, Upper = 80}});
  Vary DC(vy = {g[1]:.9f}, {{Perturbation = 0.00001, MaxStep = 0.3, Lower = -80, Upper = 80}});
  GMAT {n}.VX = vx;
  GMAT {n}.VY = vy;
  GMAT {n}.VZ = {g[2]:.9f};
  Propagate prop({n}) {{{n}.ElapsedDays = {c['tof']}}};
  GMAT dX = {n}.SunEc.X - Mars.SunEc.X;
  GMAT dY = {n}.SunEc.Y - Mars.SunEc.Y;
  GMAT dZ = {n}.SunEc.Z - Mars.SunEc.Z;
  Achieve DC(dX = 0, {{Tolerance = 500}});
  Achieve DC(dY = 0, {{Tolerance = 500}});
EndTarget;
Report rep vx vy vz dX dY dZ;
"""
    R.run('target', s)
    rows = read_rows(out)
    assert len(rows) == len(cases)
    for c, r in zip(cases, rows):
        c['v'] = [r[0], r[1], c['guess'][2]]; c['miss_km'] = norm(r[3:5]); c['dz_km'] = abs(r[5])
    return cases

# ---------- 3. GMAT propagates each targeted transfer, reporting every two days ----------
def propagate(R, cases):
    out = os.path.join(R.work, 'prop.txt')
    s = HEAD + "Create Variable k cid;\n" + report_file('rep', R.winpath(out))
    for i, c in enumerate(cases):
        s += sc_block('s%d' % i, MJD_BASE + c['d'], c['r1'], c['v'])
    s += "BeginMissionSequence;\n"
    for i, c in enumerate(cases):
        n = 's%d' % i; steps = int(c['tof'] // 2); rest = c['tof'] - 2 * steps
        rep = f"Report rep cid {n}.SunEc.X {n}.SunEc.Y {n}.SunEc.Z {n}.SunEc.VX {n}.SunEc.VY {n}.SunEc.VZ;\n"
        s += f"GMAT cid = {i};\n" + rep + "GMAT k = 0;\n" + \
             f"While k < {steps}\n  Propagate prop({n}) {{{n}.ElapsedDays = 2}};\n  " + rep + "  GMAT k = k + 1;\nEndWhile;\n"
        if rest > 1e-6: s += f"Propagate prop({n}) {{{n}.ElapsedDays = {rest:.6f}}};\n" + rep
    R.run('prop', s)
    for c in cases: c['pts'] = []
    for r in read_rows(out): cases[int(r[0])]['pts'].append(r[1:])
    return cases

def pack(vals, fmt='h'):
    return base64.b64encode(struct.pack('<%d%s' % (len(vals), fmt), *vals)).decode()
def q(v, k): return max(-32767, min(32767, int(round(v * k))))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gmat', required=True, help='GMAT bin folder (holds GmatConsole.exe)')
    ap.add_argument('--wine', default='/usr/lib/wine/wine64')
    ap.add_argument('--work', default='gmat_work')
    ap.add_argument('--out', default='js/gmat_data.js')
    a = ap.parse_args()
    R = Runner(a.gmat, a.wine, a.work)
    E = Eph(ephemeris(R)); print('ephemeris rows', len(E.rows))
    QE = QEph(E)
    cases = target(R, plan_cases(E, QE))
    bad = [c for c in cases if c['miss_km'] > 5000]
    if bad: print('not converged (dropped):', [(c['type'], c['d']) for c in bad])
    cases = propagate(R, [c for c in cases if c['miss_km'] <= 5000])
    # ephemeris: Earth and Mars x, y, z in units of 1e-4 AU, one row per day from day -EPH_PRE
    eph = []
    for r in E.rows:
        for o in (1, 7): eph += [q(r[o] / AU, 1e4), q(r[o + 1] / AU, 1e4), q(r[o + 2] / AU, 1e4)]
    trans = {k: [] for k in TR}
    for c in cases:
        r2, vm = E.at(c['d'] + c['tof'], 1); last = c['pts'][-1]
        c3 = norm([c['v'][i] - c['ve'][i] for i in range(3)]) ** 2
        vinf = norm([last[3 + i] - vm[i] for i in range(3)])
        pts = []
        for p in c['pts']: pts += [q(p[0] / AU, 1e4), q(p[1] / AU, 1e4), q(p[2] / AU, 1e4), q(norm(p[3:6]), 100)]
        trans[c['type']].append({'d': c['d'], 'tof': c['tof'], 'c3': round(c3, 2), 'vinf': round(vinf, 3), 'dth': round(c['dth'], 1),
                                 'miss': round(c['miss_km']), 'dz': round(c['dz_km'] / 1e6, 2), 'p': pack(pts)})
    meta = {'tool': 'NASA GMAT R2026a (GmatConsole)', 'ephemeris': 'DE421', 'frame': 'Sun-centred, mean ecliptic of J2000',
            'forces': 'point-mass Sun, Venus, Jupiter, Saturn; RK89', 'base': BASE.strftime('%Y-%m-%d'), 'ephStart': -EPH_PRE,
            'ephDays': len(E.rows), 'step': 2, 'made': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),
            'note': 'Patched conic: departs Earth centre, arrives at Mars centre in the ecliptic plane (Mars is up to 1.85 deg above or below it; dz, million km, is left to a mid-course plane change). Flight time follows the game route rule (GM.route). Escape and capture are not in these runs.',
            'route': 'perihelion at Earth on launch day, aphelion = ratio x Mars distance at arrival longitude; ratio hohmann 1, fast %.5f' % (TR['fast'] / RM)}
    with open(a.out, 'w') as fh:
        fh.write('/* Generated by tools/gmat_pipeline.py from NASA GMAT runs. Do not edit by hand. */\n')
        fh.write('window.GMAT_DATA=' + json.dumps({'meta': meta, 'eph': pack(eph), 'trans': trans}, separators=(',', ':')) + ';\n')
    for k in TR:
        L = trans[k]
        if L: print(k, len(L), 'transfers; C3 range %.1f-%.1f km2/s2; arrival %.2f-%.2f km/s' % (min(t['c3'] for t in L), max(t['c3'] for t in L), min(t['vinf'] for t in L), max(t['vinf'] for t in L)))
    print('wrote', a.out, os.path.getsize(a.out), 'bytes')

if __name__ == '__main__':
    main()
