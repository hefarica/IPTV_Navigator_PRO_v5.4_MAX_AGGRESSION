"""
Runner unificado para todas las suites del plan de pruebas sin /resolve/.
Ejecuta cada módulo, agrega resultados y produce un reporte consolidado.
Uso:  python backend/health/tests/run_all.py
"""
from __future__ import annotations

import io
import sys
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(HERE.parent) not in sys.path:
    sys.path.insert(0, str(HERE.parent))


def run_suite(name: str, module: str) -> dict:
    suite = unittest.defaultTestLoader.loadTestsFromName(module)
    stream = io.StringIO()
    runner = unittest.TextTestRunner(stream=stream, verbosity=2)
    start = time.monotonic()
    result = runner.run(suite)
    elapsed = time.monotonic() - start
    return {
        'suite': name,
        'tests_run': result.testsRun,
        'failures': len(result.failures),
        'errors': len(result.errors),
        'skipped': len(result.skipped),
        'success': result.wasSuccessful(),
        'elapsed_sec': round(elapsed, 3),
        'output': stream.getvalue(),
    }


def main() -> int:
    suites = [
        ('prepublish_checker', 'test_prepublish_checker'),
        ('publication_gate',   'test_publication_gate'),
        ('contracts',          'test_contracts'),
    ]
    results = []
    for label, mod in suites:
        print(f'\n{"="*70}\n▶ Running suite: {label} ({mod})\n{"="*70}')
        r = run_suite(label, mod)
        results.append(r)
        print(r['output'])
        print(f"  → {r['tests_run']} tests | {r['failures']} failures | {r['errors']} errors | {r['elapsed_sec']}s")

    print('\n' + '='*70)
    print('REPORTE CONSOLIDADO')
    print('='*70)
    total_tests = sum(r['tests_run'] for r in results)
    total_failures = sum(r['failures'] for r in results)
    total_errors = sum(r['errors'] for r in results)
    total_skipped = sum(r['skipped'] for r in results)
    total_elapsed = sum(r['elapsed_sec'] for r in results)
    print(f'  Suites:    {len(results)}')
    print(f'  Tests:     {total_tests}')
    print(f'  Failures:  {total_failures}')
    print(f'  Errors:    {total_errors}')
    print(f'  Skipped:   {total_skipped}')
    print(f'  Total:     {total_elapsed:.2f}s')
    all_ok = all(r['success'] for r in results)
    print(f'\n  Veredicto: {"PASS" if all_ok else "FAIL"}')
    return 0 if all_ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
