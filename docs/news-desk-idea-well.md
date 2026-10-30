# Signal Desk — the idea well

Where the News Desk looks for ideas, and what it has learned about which ones land. The
brief (`docs/news-feed-content-brief.md`) owns editorial policy and wins every conflict;
this file only widens the search. Nothing here is a source or a licence. Every idea still
has to clear §6, get each fact from a page you can link, and obey §10, above all §10.4: no
claim about our own network's coverage or performance.

Members: add to this file freely (a source worth scanning, a seed idea, a seasonal hook).
To ask for one specific post, file a `desk:topic` issue instead (runbook, "Proposing
topics").

## What lands and what doesn't

These merged posts show the shape that works. Read them as models:

- `2026-09-10-canyon-radio-height` opens on something residents have lived through (two
  radios a mile apart that can't hear each other) and explains the physics behind it.
- `2026-10-12-radio-privacy-codes` takes a setting everyone has used and shows what it
  actually does.
- `2026-10-20-mesh-message-signing` explains what a new feature guarantees by explaining
  how it works.
- `2026-09-27-puget-sound-mesh` tells how another volunteer network built itself.

Most declined drafts share a different shape (several were closed without a comment, so
this is the pattern, not the reviewers' stated reason). An occasion (a rule taking effect, a drill
this weekend, a shutoff that just ended) becomes "a good prompt" to restate a procedure.
The body is stitched from quoted fragments of the agency's own page, and the post ends on a
numbered checklist. A reader could have got all of it from the agency. In October 2026 that
shape produced drafts on an exercise weekend, an RF-exposure rule, winterizing a node,
road-status channels, a past fire's evacuation-zone splits, the PSPS (twice) and checking a
radio's FCC ID (twice). Every one was declined.

Two ruts to stay out of:

- **The outage frame.** "For the days when the cell network and the power go out" opens
  four merged posts (GMRS repeaters, the weather radio, the household plan, privacy codes)
  and two of October's declined drafts. It is true, and readers have seen it many times.
  Local relevance has other sources (below).
- **The household-kit checklist.** The archive already has a comms plan, alert sign-up, a
  weather radio, and evacuation zones, and road status and buying a radio were declined.
  That subject is used up. A new household post needs a reason a curious reader would
  open it, as well as a reason it is useful.

## Story shapes

Rotate these. Your slate (writer prompt, step 4) should cover at least three. The names
are working labels for you. They never appear in a post.

1. **The everyday puzzle.** Something a resident has noticed and never had explained: why
   the radio works from the driveway but not the kitchen, why a handheld picks up a far-off
   station on some mornings, why a text can get through when a call won't. Open on the
   puzzle. The body of the post is the mechanism.
2. **How a system you rely on works.** What happens behind something residents use without
   seeing it: how a warning gets from the National Weather Service to a car radio, how a
   remote weather station on a ridge reports with no phone line, how the smoke cameras on
   Sierra peaks are watched, how a repeater receives and transmits at the same time.
3. **What a development actually changes.** A firmware release, an FCC order, or a new
   class of device, explained by how it works: what it guarantees, what it costs, what it
   leaves alone. Not a release-notes summary and not a buying guide.
4. **Another network's choices.** How a peer community built and runs its network, and the
   trade-off it made. Corroborate per §4.2. Candidates: NYC Mesh, other MeshCore and
   Meshtastic regional networks, a ham club's emergency net, a CERT team.
5. **The settled past.** An event that ended long enough ago to be fully documented, with
   an official record: an after-action report, a regulator's investigation, a peer-reviewed
   study. Tell it as a story about how warnings and communications held up, with a lesson,
   not as a timeline. Stay inside what the record says.
6. **The number explained.** A figure people repeat without knowing where it comes from:
   the range printed on a radio's box, "watts," "decibels," a battery's amp-hours. Say
   where the number comes from and what it means here.
7. **The bench.** Something readers can build, measure, or try with their own kit, and why
   it works: a simple antenna from hardware-store parts, reading SWR, listening to what is
   on the air locally with an inexpensive software-defined radio. The explanation is the
   point. The steps show it works.

## Local relevance beyond the outage

The writer prompt lists the allowed sources of local relevance: terrain, towns, season,
and the reader's own kit. These parts of that list get little use:

- **The ground itself.** Granite ridges, the Stanislaus and Mokelumne canyons, conifer
  canopy, the fog and temperature inversions over the valley: what they do to radio here.
- **Infrastructure residents can see.** Ridge-top weather stations, smoke cameras, the fire
  lookouts, Caltrans winter operations on Highways 4 and 108. Public, documented things
  only. Never our own relay sites (§10.8).
- **Local history.** The fires and storms these counties remember, told from the record.
- **The radio calendar.** Contest weekends and Field Day, when local operators are on the
  air. Use the event as a peg for a subject (what a Field Day station runs on, what a
  contest exchange tests). A post announcing the event was declined.

## Where to look

Scan several of these each run, not only the news. They are places to find a subject.
Cite the primary source you end up using.

- **Mesh and LoRa:** MeshCore's GitHub releases, blog, and docs; Meshtastic's blog and
  release notes; Semtech's LoRa documentation; Hackaday's radio and LoRa coverage.
- **Amateur radio and spectrum:** ARRL News; the FCC's Daily Digest and EDOCS.
- **Warning and hazard systems:** NWS Sacramento (forecasts, area forecast discussions,
  fire weather); FEMA IPAWS and the FCC's EAS and WEA pages; USGS ShakeAlert;
  ALERTCalifornia (UC San Diego); CAL FIRE news releases and its incident archive; Cal OES.
- **Power and roads:** Caltrans District 10 (Highways 4, 49, 108); the PSPS post-event
  reports PG&E files with the CPUC. Check the declined list before writing about PSPS.
- **Local press, for pegs and corroboration:** myMotherLode, The Union Democrat, the
  Calaveras Enterprise.
- **Peer networks:** NYC Mesh; regional MeshCore and Meshtastic community sites; ARRL ARES
  reports; FEMA's CERT program news.
- **The record, for history:** after-action reports, CPUC and FCC investigations, NIST and
  U.S. Fire Administration reports, open-access research.

## Seasonal hooks

Check each year's dates before using one. A hook is a reason to run a subject now. It is
never the subject.

| Month | Hooks                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nov   | Daylight saving time ends and solar days shorten; first snow and chain controls on Highway 4; winter closure of Ebbetts Pass (Hwy 4) and Sonora Pass (Hwy 108); ARRL Sweepstakes |
| Dec   | Winter solstice, the least sun of the year for anything solar-powered; atmospheric-river storms                                                                                  |
| Jan   | Winter Field Day; the height of storm season                                                                                                                                     |
| Feb   | Late-winter storms                                                                                                                                                               |
| Mar   | Daylight saving time begins; spring storms                                                                                                                                       |
| Apr   | Snowmelt; the run-up to fire season                                                                                                                                              |
| May   | Wildfire-preparedness campaigns; Dayton Hamvention, where new ham gear is announced; the passes reopen (it depends on the snowpack)                                              |
| Jun   | ARRL Field Day; fire season begins in earnest                                                                                                                                    |
| Jul   | Fourth of July fireworks and fire risk; heat and batteries                                                                                                                       |
| Aug   | Peak fire season; dry lightning                                                                                                                                                  |
| Sep   | National Preparedness Month                                                                                                                                                      |
| Oct   | Fire Prevention Week; the Great ShakeOut; offshore-wind season; ARRL Simulated Emergency Test                                                                                    |

## Seed ideas

These were not covered when this file was last edited. Check the archive, the in-review
drafts, and the declined list before you use one. Once one is published the archive covers
it, and a member removes it from this list. Each seed is an angle only: the facts and the
sources are yours to find.

1. Why a text can get through when a call won't: how a busy cell network handles each one.
   (Puzzle. Cover it as cellular engineering. No turn to the mesh.)
2. How a warning gets from the National Weather Service to a car radio: the Emergency Alert
   System and the stations that relay it. (System.)
3. How a remote weather station on a ridge reports in: the RAWS network behind fire-weather
   forecasts, and how a reading leaves a site with no phone line. (System. Close to the
   reader's interest in off-grid telemetry.)
4. How the smoke cameras on Sierra peaks work: ALERTCalifornia, what the cameras see, and
   who watches them. (System.)
5. How a repeater receives and transmits at once: the frequency offset and the duplexer.
   (System. Builds on the 08-15 GMRS post without repeating it.)
6. Why a handheld sometimes hears stations far past the horizon: temperature inversions
   and tropospheric ducting. (Puzzle.)
7. How a lightning detection network locates a strike. (System. Relevant to fire season
   without touching an incident.)
8. The range printed on a radio's box, and the test conditions behind that number.
   (Number. The 09-10 post covers height and line of sight; this one is about the
   marketing figure.)
9. What "watts" and "decibels" mean on a radio's spec sheet, and why 3 dB is a doubling of
   power. (Number.)
10. How fire lookouts reported smoke before radio, and after, in the Stanislaus National
    Forest if the record allows. Source it from the U.S. Forest Service's own history
    pages. (Settled past.)
11. What the record shows about warnings in the 2015 Butte Fire in Calaveras. Only if an
    official after-action report or investigation covers alerting. (Settled past.)
12. How Winlink moves email over radio when the internet is down. (System.)
13. How APRS turns a radio into a position and weather beacon, and how its internet
    gateways work. (System.)
14. How NYC Mesh grows building by building, on Wi-Fi rather than LoRa. (Peer network. Cover
    it on its own terms.)
15. What can be heard on the air locally with an inexpensive software-defined radio.
    (Bench. Technical basics only. Nothing about scanner laws, §10.9.)
