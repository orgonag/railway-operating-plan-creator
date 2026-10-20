# Prior art and data formats

Compiled 2026-10-20 from web research. "Verified" means checked on a primary page (model card, official docs, licence page). "Secondary" means seen only on blogs, aggregators or price trackers. Prices change often; treat every price as a snapshot.

## Summary

- No public dataset or benchmark for parsing rail track schematics was found. This project builds a small synthetic one.
- The closest research is P&ID and circuit schematic digitization. Both report that combining geometry or detection with a language model beats a model alone, which is why pipelines A and C are in the spec.
- railML 3 is the main rail data standard but is licensed CC BY-NC-ND 4.0 with registration and certification rules, so PlanReading borrows its concepts (track elements joined at nodes) without copying its schema.
- OpenStreetMap railway tags are free to reuse as vocabulary and give us track roles and switch fields.
- No open format covers customer switching steps (arrive, shove to racks, pull empties), so PlanReading defines its own work steps.


### Diagram-to-graph research
- **P&ID to graph:** Sturmer et al., "From Engineering Diagrams to Graphs: Digitizing P&IDs with Transformers" (arXiv 2411.13929, Nov 2024). Relationformer extracts symbols and connections jointly; >25% better edge detection vs modular baseline; releases PID2Graph dataset. https://arxiv.org/abs/2411.13929
- **P&ID classic pipeline:** Mani et al., CVPRW 2020, CNN symbols + graph search along lines. https://mlanthology.org/cvprw/2020/mani2020cvprw-automatic
- **P&ID with LLMs:** LAPSE 2026.0420 (Jun 2026) frames digitization as tag extraction + topology inference. https://psecommunity.org/LAPSE:2026.0420
- **Circuit schematic to netlist:** SINA (arXiv 2601.22114, Jan 2026): detector + OCR + GPT-4o; 2.72x accuracy over Masala-CHAI. https://arxiv.org/pdf/2601.22114
- **Diagram to code benchmarks:** VCG-Bench, diagrams as mxGraph/draw.io XML (arXiv 2605.15677) https://www.alphaxiv.org/overview/2605.15677 ; SADU software architecture diagrams with JSON annotations (arXiv 2604.04009) https://arxiv.org/pdf/2604.04009
- **Railway schematics specifically (thin literature):** IIT Kharagpur MS thesis on Railway Engineering Scale Plan images, separating tracks and points via curve tracing https://cse.iitkgp.ac.in/~chitta/pubs/priyankaBasak-MSThesis.html ; SPIE 2024 OpenCV recognition of interlocking station layout screens https://biomedicaloptics.spiedigitallibrary.org/conference-proceedings-of-spie/13259/132591F/ ; Roanes-Lozano et al. 2021, graph model for station track layout design (DOI 10.1016/J.CAM.2021.113455). No open rail-schematic parsing dataset or VLM benchmark found.

### Open formats
- **railML 3.x (IS infrastructure, RS rolling stock, TT timetable; 3.3 published Nov 5, 2024).** Topology = `netElements` + `netRelations` (with navigability and positionOnA/B), derived from RailTopoModel; functional elements (tracks, switches, signals) attach to topology. **License caution (verified):** railML 3.1+ schemas are CC BY-NC-ND 4.0; free registration required even for research; commercial/productive use needs certification (then CC BY-ND 4.0); no derivatives; distribute only via railml.org. Safer approach: design your own JSON with similar concepts and offer railML export later after certification. https://www.railml.org/en/licence , https://wiki3.railml.org/wiki/IS:topology , https://wiki3.railml.org/wiki/IS:netRelation , https://www.railml.org/en/news/railml-3-3-overview-of-key-developments
- **RailTopoModel (UIC IRS 30100, 2016).** Conceptual model: NetElement, NetRelation, positioned relations, linear/areal locations. License for the model docs not found. https://www.RailTopoModel.org/state-of-development.html , https://ojs.cvut.cz/ojs/index.php/APP/article/view/4442
- **OpenStreetMap / OpenRailwayMap tagging (ODbL data; tags themselves free to reuse as vocabulary).** `railway=rail` + `service=siding|yard|spur|crossover`; `railway=switch` nodes with `railway:switch=default|three_way|single_slip|double_slip|wye|abt`, `railway:turnout_side=left|right`, `ref`; `railway:track_ref` for track numbers. Note OSM "siding" vs "yard" vs "spur" semantics differ from US usage (a customer industry track is `service=spur`). https://wiki.openstreetmap.org/wiki/Tag:railway%3Dswitch , https://wiki.openstreetmap.org/wiki/Key:railway:switch , https://wiki.openstreetmap.org/wiki/Key:service , https://wiki.openstreetmap.org/wiki/Zh-hans:OpenRailwayMap/Tagging
- No open standard found for US-style switching "work orders" (arrive, shove to rack, pull empties). railML TT covers timetabled train runs, not yard switching moves. The ordered steps likely need a custom schema.

Suggested JSON alignment: nodes (end, switch with legs A/B/C, buffer stop), segments (netElement-like, two node refs, length, polyline for drawing), switch (`turnout_side`, normal/reverse leg), track `service` (main/siding/spur/yard), spots (segment id + offset, rack id), consist (ordered car list), steps (action enum, train/cut ref, from/to spot, direction).
