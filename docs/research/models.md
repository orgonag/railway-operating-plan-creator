# Candidate models and structured output

Compiled 2026-10-20 from web research. "Verified" means checked on a primary page (model card, official docs, licence page). "Secondary" means seen only on blogs, aggregators or price trackers. Prices change often; treat every price as a snapshot.

## Recommendation

Start the benchmark with **Qwen3-VL** (8B local, 32B and 235B-A22B hosted). It has the most mature tooling (Ollama, vLLM, llama.cpp), explicit 2D grounding, and an Apache 2.0 licence. Run **Qwen3.5** (9B local) and **Gemma 4** (E4B local, 31B hosted) beside it, since both are Apache 2.0 and cheap to host. Keep **Florence-2** (MIT, under 1B) as an optional label-finding pre-pass for pipeline C on raster images. **Molmo 2** is the strongest open pointing model, but its card notes some training data is non-commercial only, so treat it as a research comparison.

Avoid for now: Llama 4 and Llama 3.2 Vision (custom licence with an EU clause on multimodal use) and Gemma 3 (Gemma Terms of Use). Check the MiniCPM-V 4.5 LICENSE file before using it; sources disagree.

All of this is a starting guess until the benchmark runs. The point of the project is to measure, not to pick by reputation.

## Model survey

### Shortlist for this project

1. **Qwen3.5 (small dense 4B/9B, or 27B / 35B-A3B MoE)** - Apache 2.0, native vision in every size, newest family, strong doc/OCR scores. First pick to prototype.
2. **Qwen3-VL (2B to 235B)** - Apache 2.0, mature tooling (vLLM, Ollama, llama.cpp GGUF), explicit 2D grounding on a 0-1000 grid. Safest pick for bounding boxes and coordinates.
3. **Gemma 4 (E2B, E4B, 26B-A4B, 31B)** - now Apache 2.0, lists pointing, object detection, chart and PDF parsing. Cheap to host.
4. **Molmo 2 (4B, 8B)** - Apache 2.0, best-known open model for pointing (x,y on a 0-1000 scale). Good as a second-pass "where is switch S3" locator.
5. **Florence-2 (0.23B / 0.77B)** - MIT, not a chat model, but gives boxes and OCR-with-region in a fixed JSON-like format. Useful for a cheap pre-pass that finds text labels (track numbers, rack names).

### Per-model notes

| Model | License | Sizes | Runtimes | Diagram / grounding notes | Benchmarks (source) |
|---|---|---|---|---|---|
| Qwen3.5 | Apache 2.0 (verified, 397B card) | 0.8B, 2B, 4B, 9B (Mar 2, 2026); 27B, 35B-A3B, 122B-A10B, 397B-A17B (Feb 2026) | vLLM, SGLang; Ollama `qwen3.5` tag (secondary) | Early-fusion native vision. Hybrid thinking: one guide reports JSON parse failures with reasoning on, so disable thinking or use constrained decoding | 397B: OCRBench 93.1, AI2D 93.9, CharXiv-RQ 80.8, OmniDocBench1.5 90.8 (verified, HF card). ChartQA/DocVQA not reported |
| Qwen3-VL | Apache 2.0 (verified, 8B card) | 2B, 4B, 8B, 32B dense; 30B-A3B, 235B-A22B MoE; Instruct and Thinking | vLLM, SGLang, Transformers (verified); Ollama `qwen3-vl` 2B-235B (verified registry); 100+ community GGUF quants | 2D/3D grounding. Coordinates on a relative 0-1000 grid (secondary, multiple sources; Qwen2.5-VL used absolute pixels of the resized image) | 235B: DocVQA 96.5, ChartQA 90.3, OCRBench 875 (tech report arXiv 2511.21631). 8B: DocVQA 96.1 (secondary) |
| Qwen2.5-VL | 7B, 32B Apache 2.0; 3B and 72B under Qwen custom licenses (from memory, not re-verified) | 3B, 7B, 32B, 72B | vLLM, Ollama, llama.cpp | Absolute-pixel grounding | Superseded by Qwen3-VL; not re-checked |
| Gemma 4 | Apache 2.0 (HF license tag verified; switch from Gemma Terms reported by several outlets, released Apr 2, 2026) | E2B, E4B, 26B-A4B MoE, 31B dense (a "12B" appears only on one tracker, unverified) | vLLM, Ollama `gemma4` | Card lists object detection, pointing, document/PDF parsing, chart comprehension, UI understanding; selectable visual token budgets 70 to 1120 | 31B: OmniDocBench1.5 edit distance 0.131, ParseBench mean 62.4, MMMU-Pro 76.9 (verified, HF card). No ChartQA/DocVQA listed |
| Gemma 3 | Gemma Terms of Use (custom, not OSI) | 4B, 12B, 27B vision | Ollama, llama.cpp, vLLM | Superseded by Gemma 4 | Not checked |
| InternVL3.5 | Apache 2.0 (verified, 8B card) | 1B, 2B, 4B, 8B, 14B, 38B; 20B-A4B, 30B-A3B, 241B-A28B MoE | vLLM, LMDeploy, SGLang (verified) | Strong OCR/chart; paper Aug 25, 2025 | 241B: OCRBench 90.7, MMMU 77.7 (secondary). Small-size numbers only in chart images, not verified |
| Molmo 2 | Apache 2.0, but card warns some training data is non-commercial research only (verified) | 4B, 8B (Qwen3 base), O-7B (Olmo base, fully open). Released Dec 16, 2025 | Transformers; vLLM/Ollama support not verified | Pointing and tracking; points in `<points coords=...>` tags, scaled by 1000 (verified) | 8B avg 63.1 over 15 benchmarks vs Qwen3-VL-8B 59.5 (verified, Ai2's own table) |
| Mistral Small 3.2 (24B) | Apache 2.0 (secondary); reported deprecated Apr 30, 2026 in favor of Small 4 (secondary, unverified) | 24B | vLLM, Ollama | General vision | Not checked |
| Ministral 3 | Apache 2.0 (verified, 14B card) | 3B, 8B, 14B; Base/Instruct/Reasoning; 0.4B vision encoder | vLLM; 14B FP8 fits in 24 GB (verified) | Native JSON output and function calling | Not checked |
| Pixtral 12B | Apache 2.0 (secondary) | 12B | vLLM, Ollama | Older (Sep 2024) | Not checked |
| Llama 4 Scout / Maverick | Llama 4 Community License: custom, "Built with Llama" attribution, 700M MAU clause, EU restriction on multimodal use (secondary; scope disputed between sources) | 109B-A17B, ~400B-A17B MoE | vLLM, Ollama | Avoid if any EU users or if a clean open license matters | Not checked |
| Llama 3.2 Vision | Llama 3.2 Community License with similar EU vision carve-out (from memory, not re-verified) | 11B, 90B | Ollama, vLLM | Older | Not checked |
| Phi-4-reasoning-vision-15B | MIT (verified) | 15B, released Mar 4, 2026 | Transformers, vLLM (not verified) | GUI grounding, ScreenSpot-V2 88.2 | ChartQA 83.3, AI2D 84.8, OCRBench 76.0 (verified, HF card) |
| Phi-4-multimodal-instruct | MIT (secondary) | 5.6B | Transformers | Weaker on documents than above | Not checked |
| MiniCPM-V 4.5 | Card says Apache 2.0 for code and weights, optional questionnaire (verified). Older MiniCPM versions used a custom "MiniCPM Model License"; a Voxel51 page still says that, so re-check the LICENSE file | 8B (Qwen3-8B + SigLIP2) | llama.cpp (b6282+), vLLM (0.10.2+) verified; Ollama "waiting for release" on the card | Strong OCR | Card claims OCRBench lead over GPT-4o-latest; no number given |
| SmolVLM2 | Apache 2.0 (verified) | 256M, 500M, 2.2B | Transformers, llama.cpp/MLX community | Tiny, browser-capable; weak on dense schematics | 2.2B: DocVQA 79.98, ChartQA 68.84, OCRBench 72.9 (verified) |
| Granite Vision 3.3 2B | Apache 2.0 (secondary: Replicate) | 2B | vLLM, Ollama | Document-focused | Not checked |
| Granite-Docling-258M | Apache 2.0 (verified via Ollama listing); Docling library is MIT | 258M | Ollama `ibm/granite-docling`, Docling | Outputs DocTags (layout, tables, charts). Good for page text/tables, not for track topology | Not checked |
| DeepSeek-OCR 2 | Apache 2.0 (verified, HF card); DeepSeek-OCR v1 is MIT | 3B, paper Jan 28, 2026 | vLLM, SGLang, Transformers (verified) | Document to markdown; box output not confirmed | Not checked |
| DeepSeek-VL2 | DeepSeek license (custom, secondary) | Tiny/Small/base MoE | vLLM | Older | Not checked |
| Florence-2 | MIT (verified) | 0.23B, 0.77B | Transformers; ONNX/browser ports exist | Task prompts `<OD>`, `<OCR_WITH_REGION>`, `<DENSE_REGION_CAPTION>` return bboxes + labels (verified) | Not checked |

### VRAM rules of thumb (4-bit, secondary)
- Qwen3.5: 9B about 6 GB, 4B about 3 GB, 2B/0.8B under 2 GB.
- Qwen3-VL-4B Q4_K_M GGUF about 3.3 GB, min 6 GB VRAM.
- Gemma 4 26B-A4B about 18 GB at 4-bit.
- Ministral 3 14B FP8 about 24 GB (verified).
- Add headroom for image tokens: a large schematic at high resolution can be thousands of visual tokens.

### Hosted prices (USD per 1M tokens, input / output; secondary trackers, Aug to Sep 2026)
- Qwen3-VL-8B on OpenRouter: about 0.12 / 0.45.
- Qwen3-VL-32B on OpenRouter: about 0.10 / 0.42.
- Qwen3-VL-30B-A3B Instruct: 0.13 / 0.52 (Thinking output 1.56).
- Qwen3-VL-235B-A22B: about 0.26 / 1.04.
- Gemma 4 31B: OpenRouter 0.10 to 0.13 / 0.34 to 0.38; Together 0.20 to 0.28 / 0.50 to 0.86; Google API 0.14 / 0.40; DeepInfra input as low as 0.09.
- Groq pricing for these vision models: not found.
- OpenRouter accepts `response_format` for these models but its docs do not guarantee schema enforcement per provider (verified pages say "see API reference"). Could not read OpenRouter's live model list from this environment.
- Ollama Cloud does not support structured outputs (verified, Ollama docs).

### Takeaways for track schematics
- No public benchmark covers rail schematic parsing. ChartQA/DocVQA/OCRBench measure text and chart reading, not topology. Expect to build a small in-house eval set (10 to 30 annotated plans) and score node/edge F1.
- Closest analog evidence: SINA (circuit schematic to netlist) found a hybrid of a detector + OCR + VLM beat VLM-only (arXiv 2601.22114). P&ID work shows joint graph extraction beats modular pipelines by >25% on edges (arXiv 2411.13929). Suggests: VLM for labels, consist and step text; geometric pass or a second grounding call for coordinates; human edit on canvas as the safety net.

Sources:
- https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct (read 2026-10-20)
- https://arxiv.org/pdf/2511.21631 (Qwen3-VL tech report, Nov 2025)
- https://huggingface.co/Qwen/Qwen3.5-397B-A17B (read 2026-10-20)
- https://gigazine.net/gsc_news/en/20260303-qwen-3-5-small (Mar 3, 2026)
- https://artificialanalysis.ai/articles/qwen3-5-small-models
- https://insiderllm.com/guides/qwen-3-5-small-models-9b-beats-30b/
- https://deepwiki.com/QwenLM/Qwen3-VL/5.2-spatial-understanding-and-2d-grounding
- https://github.com/QwenLM/Qwen3-VL/issues/1616
- https://huggingface.co/google/gemma-4-31B-it (read 2026-10-20; tech report arXiv 2607.02770)
- https://gigazine.net/gsc_news/en/20260403-google-released-gemma-4 (Apr 3, 2026)
- https://discuss.ai.google.dev/t/gemma-4-launch-announcement/138069
- https://huggingface.co/OpenGVLab/InternVL3_5-8B (read 2026-10-20)
- https://www.aibase.com/news/20945
- https://huggingface.co/allenai/Molmo2-8B (read 2026-10-20)
- https://www.hpcwire.com/aiwire/2025/12/17/ai2-releases-molmo-2-open-multimodal-family-for-video-and-multi-image-understanding/
- https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512 (read 2026-10-20)
- https://ai-tldr.dev/models/mistral-small-3-2/
- https://playground.roboflow.com/models/mistral/pixtral-12b
- https://the-decoder.com/meta-releases-first-multimodal-llama-4-models-leaves-eu-out-in-the-cold/
- https://labelbox.com/product/model/foundry-models/llama-4-maverick
- https://huggingface.co/microsoft/Phi-4-reasoning-vision-15B (read 2026-10-20)
- https://huggingface.co/openbmb/MiniCPM-V-4_5 (read 2026-10-20)
- https://docs.voxel51.com/plugins/plugins_ecosystem/minicpm_v.html
- https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct (read 2026-10-20)
- https://replicate.com/ibm-granite/granite-vision-3.3-2b
- https://ollama.com/ibm/granite-docling:258m/blobs/cfc7749b96f6
- https://huggingface.co/deepseek-ai/DeepSeek-OCR-2 (read 2026-10-20)
- https://huggingface.co/microsoft/Florence-2-large (read 2026-10-20)
- https://registry.ollama.ai/library/qwen3-vl
- https://www.betterclaw.io/blog/ollama-models-tool-calling-support (Aug 18, 2026)
- https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/
- https://anotherwrapper.com/tools/llm-pricing/qwen3-vl-32b-instruct
- https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/openrouter/model/qwen3-vl-235b-a22b-instruct
- https://computeprices.com/providers/openrouter/models/qwen3-vl-8b
- https://computeprices.com/providers/openrouter/models/gemma-4-31b-it
- https://computeprices.com/providers/together-ai/models/gemma-4-31b-it
- https://pricepertoken.com/pricing-page/model/google-gemma-4-31b-it

## Structured JSON output

| Option | How | Notes |
|---|---|---|
| vLLM | `response_format: {type: "json_schema", json_schema: {name, schema}}` or `extra_body={"structured_outputs": {"json": schema}}`; backend via `--structured-outputs-config.backend` (default `auto`) | Backends: xgrammar, guidance (also outlines, lm-format-enforcer for regex). `guided_json` and other `guided_*` params were removed in v0.12.0 (verified, latest docs) |
| llama.cpp server | `/chat/completions` with `response_format` JSON schema; `/completion` with `json_schema`; raw GBNF via `grammar` or `--grammar-file` | Supports a JSON Schema subset (enum, const, required, anyOf/oneOf, $ref/$defs, min/max). Unsupported keywords silently ignored, so validate after (secondary, Liquid AI docs) |
| Ollama | `format: <JSON schema>` (or Pydantic `model_json_schema()`), works with vision models and images | Since Dec 2024. Also put the schema in the prompt. Not supported on Ollama Cloud (verified docs) |
| XGrammar | Apache 2.0 library; default backend in vLLM, SGLang, TensorRT-LLM, MLC-LLM | JSON, regex, CFG (verified repo) |
| Outlines (dottxt) | Apache 2.0 (verified repo); backends: vLLM, Ollama, transformers, llama.cpp, OpenAI, Gemini | Repo page does not state vision support; a community tutorial uses it with a small VLM |
| LM Studio | Supports JSON schema structured output via its OpenAI-compatible API | Not re-verified in this pass |

Practical notes:
- Turn off "thinking" modes for Qwen3.5 / Qwen3-VL Thinking when constraining, or let it think then constrain only the final block.
- Keep the schema flat-ish with ids and references (tracks reference node ids) so a grammar can enforce it, then run a semantic validator (every segment endpoint exists, every switch has 3 legs, every step references a real spot).
- Constrained decoding guarantees shape, not correctness.

Sources:
- https://docs.vllm.ai/en/latest/features/structured_outputs.html (read 2026-10-20)
- https://docs.vllm.ai/en/v0.10.2/features/structured_outputs.html
- https://docs.liquid.ai/deployment/on-device/llama-cpp/structured-output
- https://docs.ollama.com/capabilities/structured-outputs
- https://registry.ollama.ai/blog/structured-outputs (Dec 2024)
- https://github.com/mlc-ai/xgrammar (read 2026-10-20)
- https://github.com/dottxt-ai/outlines (read 2026-10-20)
- https://paulabartabajo.substack.com/p/how-to-get-json-out-of-a-visual-language

## Not verified / gaps
- Exact OCRBench/ChartQA/DocVQA numbers for small Qwen3-VL, Qwen3.5, InternVL3.5, Gemma 4 sizes.
- Llama 4 EU clause scope (vision only vs all use): sources disagree; read Meta's license text.
- MiniCPM-V 4.5 license: card says Apache 2.0, a third-party page says custom; check LICENSE file.
- Molmo 2 support in vLLM / Ollama / llama.cpp.
- Gemma 4 "12B" size; Mistral Small 3.2 deprecation.
- Live OpenRouter prices and per-provider schema enforcement (OpenRouter model API was not readable from this environment).
- Groq availability of vision models.
- Licenses marked "from memory" (pdf.js, pypdfium2, python-pptx, LibreOffice, D3, Excalidraw, Cytoscape, Paper.js, PixiJS, react-konva, Qwen2.5-VL 3B/72B) were not re-checked in this pass.
- No public dataset or benchmark for rail track schematic parsing was found.
