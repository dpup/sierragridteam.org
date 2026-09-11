---
title: Antenna height beats power in the foothills
description: In foothill terrain a radio's reach is set by a clear line of sight and how high the antenna sits — not by its wattage — which is why repeaters live on ridgelines.
pubDate: 2026-09-10
tag: Explainer
author: Signal Desk
---

Two people a mile apart with a hill between them, each with a good radio, can fail to hear each other — while a handheld with a clear view of a ridgeline can reach a repeater 15 miles off. The difference is almost never the power setting. It is what sits between the two antennas, and how high they are.

## Radio that travels like light

The bands a household radio uses — the VHF and UHF channels of GMRS and ham handhelds, and the roughly 900 MHz band a LoRa mesh relay runs on — all [travel in nearly straight lines, the way light does](https://www.satelusa.com/article-line-of-sight-radio-range-antenna-heights/). "LoRa mesh" here means the network of low-power radios that pass short text messages hop to hop with no cell tower in the path. Straight-line travel is the fact everything else follows from: unlike the shortwave bands that bounce off the upper atmosphere to cross oceans, these frequencies go where they can be "seen," and stop at the horizon or the first ridge.

That horizon grows with height, not power. A rough rule from the [same line-of-sight math](https://www.satelusa.com/article-line-of-sight-radio-range-antenna-heights/): the distance in miles to the radio horizon is about the square root of twice the antenna's height in feet. A handheld held at head height — 6 feet — sees about 3.5 miles. Lift one antenna to 500 feet above the terrain, on a ridge, and its horizon alone reaches about 30. That is the whole reason two-way networks put repeaters on ridgelines: a single antenna high enough to see over the terrain can be heard across a wide area, where two radios down among the hills cannot see past the ridge between them.

## What the terrain takes

Height buys line of sight; terrain and trees take it back. A hill or ridge in the path [blocks or severely degrades the signal](https://www.satelusa.com/article-line-of-sight-radio-range-antenna-heights/) outright. Conifer canopy is subtler but real: [pine needles are 50 to 60 percent water](https://rdumesh.org/your-pine-trees-are-not-a-conspiracy-what-we-actually-know-about-915-mhz-and-pine-needles-2/) during the growing season, and water absorbs radio energy. A modeled 915 MHz path loses [about 18 decibels over 300 feet of pine forest](https://rdumesh.org/your-pine-trees-are-not-a-conspiracy-what-we-actually-know-about-915-mhz-and-pine-needles-2/), and [wet foliage adds another 3 to 8 decibels](https://rdumesh.org/your-pine-trees-are-not-a-conspiracy-what-we-actually-know-about-915-mhz-and-pine-needles-2/) — enough that a marginal link in a dry February can quit in a humid July with no hardware fault at all.

There is also the Fresnel zone — the football-shaped volume of clear air a signal needs around the straight-line path, not just the sightline itself. At 915 MHz over a 1.7-mile hop [that zone runs about 50 feet out](https://rdumesh.org/your-pine-trees-are-not-a-conspiracy-what-we-actually-know-about-915-mhz-and-pine-needles-2/) from the direct path, and an obstruction poking into it degrades the link even when the line looks open. Getting an antenna ten feet above a treetop can [recover more signal than a legal amplifier ever could](https://rdumesh.org/your-pine-trees-are-not-a-conspiracy-what-we-actually-know-about-915-mhz-and-pine-needles-2/).

## What to do with it

The practical read: on these bands, height and clearance from obstructions determine range more reliably than power output. Before reaching for a more powerful radio, put the antenna higher and in the clear — a mast, a rooftop, a few feet above the canopy — and test from where you actually stand, not from the driveway. This is also the honest limit of line-of-sight radio in the foothills: it goes where it can see, and no wattage argues with a ridge. A radio that can see the ridgeline will reach it; one boxed in by trees and rock will not.
