import unittest
from reference.planner import plan_job, ConfigError

BASE = dict(mode='inference', accelerator='cuda', compute_capability=90, gpu_count=1,
            head_count=32, kv_head_count=8, head_dim=128, layers=32, context_tokens=8192,
            kv_dtype='fp16', attention='auto', parallel='none', precision='bf16',
            model_format='safetensors', training_strategy='none', tensor_parallel=1,
            pipeline_parallel=1)

def job(**kw):
    return plan_job(BASE | kw)

class PlanTests(unittest.TestCase):
    def test_gqa_estimate(self):
        result = job()
        self.assertEqual(result['kv_cache_bytes'], 2*32*8192*8*128*2)
        self.assertEqual(result['gqa_ratio'],4)

    def test_mqa_ratio(self):
        self.assertEqual(job(kv_head_count=1)['gqa_ratio'], 32)

    def test_invalid_gqa_configuration(self):
        with self.assertRaises(ConfigError):job(head_count=30, kv_head_count=8)

    def test_quantized_kv_sizes(self):
        self.assertLess(job(kv_dtype='q4_0')['kv_cache_bytes'],job(kv_dtype='q8_0')['kv_cache_bytes'])
        self.assertLess(job(kv_dtype='q8_0')['kv_cache_bytes'],job()['kv_cache_bytes'])

    def test_quantized_kv_alignment(self):
        with self.assertRaises(ConfigError):job(head_dim=127, kv_dtype='q4_0')

    def test_fa3_hopper_only(self):
        self.assertEqual(job(attention='fa3')['attention_backend'], 'fa3')
        with self.assertRaises(ConfigError):job(attention='fa3', compute_capability=80)

    def test_auto_cuda_fa2(self):
        self.assertEqual(job(compute_capability=80)['attention_backend'], 'fa2')

    def test_auto_cuda_fa3(self):
        self.assertEqual(job(compute_capability=90)['attention_backend'], 'fa3')

    def test_android_falls_back_to_native_attention(self):
        self.assertEqual(job(accelerator='android',compute_capability=None,precision='fp16',model_format='gguf')['attention_backend'],'native_sdpa')

    def test_explicit_fa_on_mobile_refused(self):
        with self.assertRaises(ConfigError):job(accelerator='android',compute_capability=None,attention='fa2')

    def test_android_distributed_training_refused(self):
        with self.assertRaises(ConfigError):job(mode='training',accelerator='android',compute_capability=None)

    def test_fp8_requires_supported_cuda(self):
        self.assertEqual(job(precision='fp8')['precision'], 'fp8')
        with self.assertRaises(ConfigError):job(precision='fp8',compute_capability=80)

    def test_cpu_bf16_is_conservative(self):
        with self.assertRaises(ConfigError):job(accelerator='cpu',compute_capability=None,precision='bf16')

    def test_fsdp_only_distributed_training(self):
        self.assertEqual(job(mode='training',parallel='fsdp2',gpu_count=2)['parallel'],'fsdp2')
        with self.assertRaises(ConfigError):job(parallel='fsdp2',gpu_count=2)
        with self.assertRaises(ConfigError):job(mode='training',parallel='fsdp2',gpu_count=1)

    def test_zero3_on_training(self):
        self.assertEqual(job(mode='training',parallel='zero3',gpu_count=2)['parallel'],'zero3')

    def test_megatron_parallel_divisibility(self):
        self.assertEqual(job(mode='training',parallel='megatron',gpu_count=4,tensor_parallel=2,pipeline_parallel=2)['parallel'],'megatron')
        with self.assertRaises(ConfigError):job(mode='training',parallel='megatron',gpu_count=2,tensor_parallel=3)
        with self.assertRaises(ConfigError):job(mode='training',parallel='megatron',gpu_count=4,tensor_parallel=4,pipeline_parallel=2)

    def test_qlora_requires_finetuning_and_nf4(self):
        self.assertEqual(job(mode='fine_tune',training_strategy='qlora_nf4')['training_strategy'],'qlora_nf4')
        with self.assertRaises(ConfigError):job(training_strategy='qlora_nf4')

    def test_qlora_android_rejected(self):
        with self.assertRaises(ConfigError):job(mode='fine_tune',accelerator='android',compute_capability=None,training_strategy='qlora_nf4')

    def test_lora_finetuning(self):
        self.assertEqual(job(mode='fine_tune',training_strategy='lora')['training_strategy'],'lora')

    def test_explicit_mismatch_no_default_silent_override(self):
        with self.assertRaises(ConfigError):job(mode='fine_tune',parallel='zero3',gpu_count=1)

    def test_bad_dict_keys_not_allowed(self):
        with self.assertRaises(ConfigError):job(secrets='not-allowed')

    def test_negative_values(self):
        with self.assertRaises(ConfigError):job(context_tokens=-1)

    def test_boolean_cannot_be_gpu_count(self):
        with self.assertRaises(ConfigError):job(gpu_count=True)

    def test_no_flash_in_cpu_auto(self):
        self.assertEqual(job(accelerator='cpu',compute_capability=None,precision='fp32')['attention_backend'], 'math')

if __name__=='__main__':unittest.main()
