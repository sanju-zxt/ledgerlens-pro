import unittest

from synthetic_benchmark import generate, run


class SyntheticBenchmarkTests(unittest.TestCase):
    def test_generator_is_seeded_and_benchmark_is_explicitly_separate(self):
        first_x, first_y = generate(seed=123, n=500)
        second_x, second_y = generate(seed=123, n=500)
        self.assertTrue((first_x == second_x).all())
        self.assertTrue((first_y == second_y).all())

        report = run()
        self.assertTrue(report["not_customer_evidence"])
        self.assertEqual(report["status"], "SYNTHETIC BENCHMARK ONLY")
        self.assertEqual(report["split"]["test"], report["test"]["sample_size"])
        self.assertGreater(report["test"]["positives"], 0)
        self.assertIn("not representative", " ".join(report["limitations"]).lower())
        self.assertIn("vs_baseline", " ".join(report.keys()))


if __name__ == "__main__":
    unittest.main()
