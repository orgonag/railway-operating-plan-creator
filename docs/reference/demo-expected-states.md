# Demo expected states

This page is the hand-worked answer key for the customer service demo plan in `docs/schema/examples/customer-service-demo.reading.json`. It lists where every unit stands after each step, which units are coupled, and which cars are loaded. The same values live in `tests/fixtures/demo-expected.json`, which the engine tests compare against. If the two ever disagree, this page is the one to read for the reasoning and the fixture is the one the tests trust.

## Conventions (confirmed by the owner, 2026-10-20)

1. Distances on a track are measured from its start: the arrival end for the main, the switch points for a branch.
2. Turnout and clear point: the turnout is drawn 240 ft from the points; the clear point is 290 ft from the points. A branch's usable length (`lengthFt`) starts at the clear point, so its total length is 290 + `lengthFt`, with any buffer stop at that total.
3. Fouling zone: from the points to 290 ft toward the frog, on both the through and the diverging track.
4. Approach: the first switch on the main sits at least (arriving train length + 200 ft) from the arrival end, so the whole train can stand on the main before it. The main runs on past its last switch by (240 ft + arriving train length). The owner wants people to see more or less of the main by zooming and scrolling (Release 1 zoom and pan); this length is only the drawn minimum.
5. Arrival stop is the person's choice. The arrival step can carry a `stop` like any move, and the person drags the train wherever it should stand. Only when no stop is given does the train start with its head 100 ft short of the first switch's points, as a starting position to drag from.
6. Spots are fixed positions numbered from the switch end of the facility (spot 1 nearest the switch), 60 ft apart from the facility start. A facility with no `startFt` sits at the far end of its track.
7. `spot` on a step puts the leading unit's front at that spot's far edge.
8. Group order in lists runs from the head end of the arriving train.
9. Offstage is named by the main's logical boundary, `arrival_end` or `far_end`, never left or right. Layout maps these to screen sides.
10. Out-of-range stops (past a buffer stop, or beyond the drawn main) are kept as authored. The cars are drawn where the person put them, the step gets status `past_end` and a heads-up note. Reaching ft 0 of a branch means reaching its switch, not an end of track.

## The demo plan in numbers

All distances are in feet.

- Equipment: one loco `L1` (80 ft) and five cars `C1` to `C5` (60 ft each). The arriving train is 380 ft long. The loco is at the rear, so from the head end the order is C1, C2, C3, C4, C5, L1.
- `MAIN` is measured from the arrival end. The points of switch `S1` sit at MAIN 580 (380 ft train + 200 ft approach).
- `SPUR1` is measured from the S1 points. Its usable length is 800 ft starting at the clear point (290), so its total length is 1090 and the buffer stop is at 1090.
- The unloading racks `RACKS` are 360 ft long with no `startFt`, so they sit at the far end of SPUR1: 730 to 1090.
- Spots are 60 ft apart from the facility start, spot 1 nearest the switch: spot 1 is 730 to 790, spot 2 is 790 to 850, spot 3 is 850 to 910, spot 4 is 910 to 970, spot 5 is 970 to 1030.
- Facing: "up" means a unit faces toward rising ft on its track. L1 and all cars face up on MAIN and on SPUR1 throughout, because the loco never turns.

## Step by step

Occupancy is listed rear to head along the track, so the lowest ft value comes first. Coupled groups are written in the same rear to head order.

| Step | Occupancy (rear to head) | Coupled | Loaded | Notes |
|---|---|---|---|---|
| 1 Arrival | MAIN: L1 100 to 180, C5 180 to 240, C4 240 to 300, C3 300 to 360, C2 360 to 420, C1 420 to 480 | [L1, C5, C4, C3, C2, C1] | all loaded | none |
| 2 Shove | SPUR1: L1 650 to 730, C5 730 to 790, C4 790 to 850, C3 850 to 910, C2 910 to 970, C1 970 to 1030 | same | all loaded | fit, info: "5 cars at 60 ft = 300 ft, plus 10% for slack = 330 ft; the racks have 360 ft." |
| 3 Cut off | unchanged | [L1], [C5, C4, C3, C2, C1] | all loaded | none |
| 4 Run light | L1 offstage arrival_end; cars unchanged | [L1], [C5, C4, C3, C2, C1] | all loaded | none |
| 5 Unload | unchanged | same | all empty | none |
| 6 Run light | SPUR1: L1 650 to 730; cars unchanged | [L1], [C5, C4, C3, C2, C1] | all empty | none |
| 7 Couple | unchanged | [L1, C5, C4, C3, C2, C1] | all empty | none |
| 8 Pull | MAIN: L1 150 to 230, C5 230 to 290, C4 290 to 350, C3 350 to 410, C2 410 to 470, C1 470 to 530 | same | all empty | none |
| 9 Departure | all offstage arrival_end | same | all empty | none |

Status is `ok` for every step.

## How each row was worked out

1. Arrival. The arrival step has no `stop`, so the head of the train (C1) stands 100 ft short of the S1 points: C1 ends at 480. The rest of the train follows back toward the arrival end, with L1 at the rear ending at 100.
2. Shove. The step says `spot: 5`, so the leading unit (C1) has its front at the far edge of spot 5, which is 1030. The train sits behind it, L1 at the rear from 650 to 730. The fit note is informational only: five cars at 60 ft are 300 ft, with 10% slack 330 ft, and the racks have 360 ft, so everything fits. Slack is never added to positions.
3. Cut off. Nothing moves. L1 becomes its own group; the five cars stay coupled.
4. Run light. L1 leaves by the arrival end of the main and is offstage. The cars do not move.
5. Unload. Nothing moves. Every car changes from loaded to empty.
6. Run light. L1 comes back and stops on SPUR1 with its leading end at 730, which is exactly against C5. It is not coupled yet.
7. Couple. Nothing moves. L1 and the cars are one group again.
8. Pull. The stop puts the rear end of the moving group (C1, since the group is now moving toward the arrival end) 50 ft beyond the S1 points on the main: C1 ends at 530. The group sits ahead of it toward the arrival end, with L1 from 150 to 230.
9. Departure. The whole train leaves by the arrival end and is offstage.

## Fixture shape

`tests/fixtures/demo-expected.json` is an array of nine entries, one per row above. Each entry has:

- `step`: 1 to 9.
- `status`: `"ok"`.
- `units`: for every unit, either `{ "occupies": [ { "track", "fromFt", "toFt" } ] }` with a single segment (no unit straddles a switch at the end of any demo step) or `{ "offstage": "arrival_end" }`.
- `facing`: every unit mapped to `"up"`.
- `coupled`: the groups, each listed rear to head.
- `loaded`: every car `C1` to `C5` mapped to `true` or `false`. Locos are not listed.
- `notes`: an empty array, except step 2, which has the one fit note shown in the table.
