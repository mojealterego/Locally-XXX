import math
import unittest

from qfv.engine import (
    Vector3, FieldEmitter, FieldDeformer, Mesh, mesh_from_ellipse,
    RigActuator, morph_with_actuators, VisemeFusion, FuseInput,
    QFVError, AdaptiveQualityPolicy, parse_svg_path,
)


class FieldAndMeshTests(unittest.TestCase):
    def setUp(self):
        self.mesh = Mesh((Vector3(1, 0, 0), Vector3(0, 1, 0)))

    def test_vec3_add_sub(self):
        self.assertEqual(Vector3(1, 2, 3) + Vector3(2, 4, 6), Vector3(3, 6, 9))
        self.assertEqual(Vector3(3, 6, 9) - Vector3(2, 4, 6), Vector3(1, 2, 3))

    def test_vec3_finite_input(self):
        with self.assertRaises(QFVError): Vector3(float('nan'), 0, 0)

    def test_rest_mesh_immutable(self):
        rest = self.mesh.vertices
        deform = FieldDeformer([FieldEmitter('gravity', Vector3(0, 0, 0), 1, 1, Vector3(0, -1, 0))])
        _ = deform.deform(self.mesh, 0.3)
        self.assertEqual(self.mesh.vertices, rest)

    def test_zero_elapsed_identity(self):
        deform = FieldDeformer([FieldEmitter('attractor', Vector3(0, 0, 0), 1, 2)])
        self.assertEqual(deform.deform(self.mesh, 0).vertices, self.mesh.vertices)

    def test_zero_strength_identity(self):
        deform = FieldDeformer([FieldEmitter('attractor', Vector3(0, 0, 0), 0, 2)])
        self.assertEqual(deform.deform(self.mesh, 0.5).vertices, self.mesh.vertices)

    def test_attractor_moves_to_center(self):
        deformer = FieldDeformer([FieldEmitter('attractor', Vector3(0, 0, 0), 2, 2)])
        self.assertLess(deformer.deform(self.mesh, 0.1).vertices[0].x, 1)

    def test_vortex_orbits_not_radial_at_initial(self):
        emitter = FieldEmitter('vortex', Vector3(0,0,0), 1, 5, Vector3(0,0,1))
        v = emitter.velocity(Vector3(1,0,0), 0)
        self.assertAlmostEqual(v.x, 0)
        self.assertGreater(v.y, 0)

    def test_deterministic_replay(self):
        deform = FieldDeformer([FieldEmitter('attractor', Vector3(0, 0, 0), 1, 2)])
        self.assertEqual(deform.deform(self.mesh, .42), deform.deform(self.mesh, .42))

    def test_nonaccumulating_deformation(self):
        deform = FieldDeformer([FieldEmitter('attractor', Vector3(0, 0, 0), 1, 2)])
        first = deform.deform(self.mesh, .21)
        _ = deform.deform(self.mesh, .5)
        self.assertEqual(first, deform.deform(self.mesh, .21))

    def test_bad_field_name_rejected(self):
        with self.assertRaises(QFVError): FieldEmitter('unknown', Vector3(0,0,0), 1, 2)

    def test_bad_radius_rejected(self):
        with self.assertRaises(QFVError): FieldEmitter('attractor', Vector3(0,0,0), 1, 0)

    def test_bad_time_rejected(self):
        with self.assertRaises(QFVError): FieldDeformer([]).deform(self.mesh, -1)

    def test_limit_vertex_count(self):
        with self.assertRaises(QFVError): Mesh(tuple(Vector3(0,0,0) for _ in range(10_001)))

    def test_deformation_has_safety_cap(self):
        deform = FieldDeformer([FieldEmitter('gravity', Vector3(0, 0, 0), 1000, 1, Vector3(1,0,0))], max_displacement=0.2)
        self.assertLessEqual((deform.deform(self.mesh, .5).vertices[0] - self.mesh.vertices[0]).length(), .20000001)

    def test_pseudo3d_face_center_depth(self):
        mesh = mesh_from_ellipse([(0,0),(1,0),(0,1)], center=(0,0), radii=(1,1), depth=2)
        self.assertEqual(mesh.vertices[0].z, 2)
        self.assertEqual(mesh.vertices[1].z, 0)

    def test_pseudo3d_outside_rejected(self):
        with self.assertRaises(QFVError): mesh_from_ellipse([(2,0)], center=(0,0), radii=(1,1), depth=1)

    def test_pseudo3d_depth_nonnegative(self):
        with self.assertRaises(QFVError): mesh_from_ellipse([(0,0)], center=(0,0), radii=(1,1), depth=-1)

    def test_dynamic_emitter_periodic(self):
        e = FieldEmitter('gravity', Vector3(0,0,0), 1, 1, Vector3(0,1,0), frequency_hz=1)
        self.assertAlmostEqual(e.velocity(Vector3(0,0,0), 0).y, e.velocity(Vector3(0,0,0), 1).y, places=8)


class ActuatorTests(unittest.TestCase):
    def test_actuator_zero_intensity_rest(self):
        a = RigActuator('brow', Vector3(0,0,0), Vector3(0,1,0), 1, .5)
        self.assertEqual(morph_with_actuators(Mesh((Vector3(0,0,0),)), [a], {'brow':0}).vertices[0], Vector3(0,0,0))

    def test_actuator_moves_target(self):
        a = RigActuator('brow', Vector3(0,0,0), Vector3(0,1,0), 1, .5)
        self.assertGreater(morph_with_actuators(Mesh((Vector3(0,0,0),)), [a], {'brow':1}).vertices[0].y, 0)

    def test_unknown_coefficient_fail_closed(self):
        with self.assertRaises(QFVError): morph_with_actuators(Mesh((Vector3(0,0,0),)), [], {'unknown':1})

    def test_amplitude_out_of_range(self):
        a = RigActuator('brow', Vector3(0,0,0), Vector3(0,1,0), 1, .5)
        with self.assertRaises(QFVError): morph_with_actuators(Mesh((Vector3(0,0,0),)), [a], {'brow':2})

    def test_duplicate_id_rejected(self):
        a = RigActuator('brow', Vector3(0,0,0), Vector3(0,1,0), 1, .5)
        with self.assertRaises(QFVError): morph_with_actuators(Mesh((Vector3(0,0,0),)), [a,a], {'brow':1})


class FusionTests(unittest.TestCase):
    def setUp(self): self.fusion = VisemeFusion()

    def test_audio_only(self):
        out = self.fusion.process(FuseInput(0, None, [1]+[0]*13, 0, 1))
        self.assertAlmostEqual(out[0], 1)

    def test_visual_only(self):
        out = self.fusion.process(FuseInput(0, [0,1]+[0]*12, None, 1, 0))
        self.assertAlmostEqual(out[1], 1)

    def test_zero_confidence_both_rejected(self):
        with self.assertRaises(QFVError): self.fusion.process(FuseInput(0, [1]+[0]*13, [1]+[0]*13, 0, 0))

    def test_fusion_audio_dominates_occluded_video(self):
        v = [0,1]+[0]*12
        a = [1]+[0]*13
        o = self.fusion.process(FuseInput(0, v, a, .1, .9))
        self.assertGreater(o[0], o[1])

    def test_fusion_normalized(self):
        o = self.fusion.process(FuseInput(0, [2]+[0]*13, [0,3]+[0]*12, .5, .5))
        self.assertAlmostEqual(sum(o), 1)

    def test_fusion_temporal_smoothing(self):
        self.fusion.process(FuseInput(0, [1]+[0]*13, None, 1, 0))
        o = self.fusion.process(FuseInput(10_000_000, [0,1]+[0]*12, None, 1, 0))
        self.assertGreater(o[0], 0)
        self.assertLess(o[1], 1)

    def test_out_of_order_timestamps_rejected(self):
        self.fusion.process(FuseInput(10, [1]+[0]*13, None, 1, 0))
        with self.assertRaises(QFVError): self.fusion.process(FuseInput(9, [1]+[0]*13, None, 1, 0))

    def test_visemes_exact_14(self):
        with self.assertRaises(QFVError): self.fusion.process(FuseInput(0, [1,0], None, 1, 0))

    def test_ttl_requires_fresh_video(self):
        self.fusion.process(FuseInput(0, [1]+[0]*13, None, 1, 0))
        with self.assertRaises(QFVError): self.fusion.process(FuseInput(999_999_999, None, None, 0, 0))

    def test_bad_confidence(self):
        with self.assertRaises(QFVError): self.fusion.process(FuseInput(0, [1]+[0]*13, None, 1.1, 0))


class QualityAndImportsTests(unittest.TestCase):
    def test_mobile_degrade_at_high_p95(self):
        q = AdaptiveQualityPolicy(mobile=True)
        self.assertEqual(q.update(22, 0, 0), 'MOBILE_FAST')

    def test_desktop_degrade_at_high_p95(self):
        q = AdaptiveQualityPolicy(mobile=False)
        self.assertEqual(q.update(10, 0, 0), 'DESKTOP_BALANCED')

    def test_policy_restores_after_three_good_windows(self):
        q = AdaptiveQualityPolicy(mobile=True)
        q.update(25, 0, 0)
        q.update(10, 0, 0)
        q.update(10, 0, 0)
        self.assertEqual(q.update(10, 0, 0), 'MOBILE_FULL')

    def test_policy_memory_pressure(self):
        q = AdaptiveQualityPolicy(mobile=True)
        self.assertEqual(q.update(7, 0.8, 0), 'MOBILE_FAST')

    def test_svg_path_bezier_endpoint(self):
        points = parse_svg_path('M 0 0 C 0 1 1 1 1 0', subdivisions=8)
        self.assertEqual(points[0], (0.,0.))
        self.assertAlmostEqual(points[-1][0], 1)
        self.assertAlmostEqual(points[-1][1], 0)

    def test_svg_path_l_and_close(self):
        pts = parse_svg_path('M 0 0 L 1 0 L 1 1 Z')
        self.assertEqual(pts[-1], (0.,0.))

    def test_svg_path_unsupported_command_rejected(self):
        with self.assertRaises(QFVError): parse_svg_path('M 0 0 Q 1 0 1 1')

    def test_svg_path_without_move_rejected(self):
        with self.assertRaises(QFVError): parse_svg_path('L 1 1')

    def test_svg_path_overly_long_rejected(self):
        with self.assertRaises(QFVError): parse_svg_path('M 0 0 '+'L 1 1 '*3000)


if __name__ == '__main__': unittest.main()
