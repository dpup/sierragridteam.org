---
title: How fire weather stations report by satellite
description: A remote fire weather station is built to work without a phone line or power line, so it runs on a solar panel and sends each hour's readings to a satellite 22,236 miles up, in a time slot kept by GPS.
pubDate: 2026-11-02
tag: Explainer
author: Signal Desk
---

Fire-weather forecasts and fire-danger ratings depend on readings from small, fenced weather stations set out in open country. They are built to run on their own, with no phone line or power line, and each one sends its readings to a weather satellite once an hour.

## What a station measures

A Remote Automatic Weather Station, or RAWS, is a tower with a handful of sensors, a datalogger, a battery, a solar panel, and a satellite transmitter. The interagency standard for these stations, the [NWCG Standards for Fire Weather Stations](https://raws.nifc.gov/sites/default/files/inline-files/NWCG%20Standards%20for%20Fire%20Weather%20Stations_2019_1.pdf), counts more than 2,500 of them across the U.S. and lists their uses, from fire danger rating to fire weather forecasting and smoke management. It sets out what each station measures: rainfall, wind speed and direction at 20 feet, air temperature and relative humidity at 4 to 8 feet, and solar radiation. Wind and humidity are reported as 10-minute averages. Temperature is a single reading taken in the 5 minutes before the station transmits.

The standard is just as specific about where a station goes. It should sit on level, open ground in full sun, away from roads, lawns, lakes, and tall trees. It should also stay off "gullies, peaks, ridges, steep slopes, and narrow valleys," because its readings are meant to represent the general area. In the foothills, with their canyons and ridgelines, that rules out a great deal of ground.

## The path to the satellite

The station reports through the [GOES Data Collection System](https://www.nesdis.noaa.gov/data-research-services/services), which NOAA describes as a relay that carries "observations from surface based environmental platforms" through its geostationary satellites and back to each platform's owner. A geostationary satellite [orbits 22,236 miles above the equator](https://www.nesdis.noaa.gov/our-satellites/currently-flying/geostationary-satellites) at the speed the Earth turns, so it stays over one point. NOAA keeps two in service, GOES East and GOES West.

Because the satellite holds still in the sky, the station's antenna can be fixed in place. The standard has installers aim it with a compass and an inclinometer, for azimuth and elevation. One GOES transmitter, [Campbell Scientific's TX320](https://s.campbellsci.com/documents/us/product-brochures/b_tx320.pdf), is sold with an 11 dBi circularly polarized Yagi antenna and sends at 300 or 1200 bits per second, between 401.7 and 402.1 MHz. At 1200 bits per second its example output is about 11 watts.

## Taking turns by the clock

Many platforms share those frequencies. NOAA's satellite data service (the National Environmental Satellite, Data, and Information Service, or NESDIS) assigns each one an address, an uplink channel, and a time window, [according to Campbell Scientific](https://s.campbellsci.com/documents/us/product-brochures/b_tx320.pdf), and a station on a self-timed schedule transmits only within its window. A separate random mode is for urgent reports such as flood gauges, which may transmit as soon as a reading crosses a threshold.

A shared schedule works only if every clock agrees, so the NWCG standard requires a GPS receiver on any station that transmits hourly or more often. The receiver is there to keep time; the standard notes it does not store or transmit the station's location. The TX320's clock drifts up to 10 milliseconds a day and can run 28 days between GPS fixes. When a station's clock does drift, the standard calls for an immediate response, at any time of year, unless the drift is confirmed not to interfere with another station.

## Power and upkeep

The solar panel is mounted facing south. Battery voltage is sampled every hour, so a station's owner can troubleshoot it remotely, and the standard treats 11.8 volts as the minimum. [The National Park Service notes](https://www.nps.gov/zion/learn/nature/fire-weather.htm) that the readings go to the National Interagency Fire Center in Boise, and that a station can be called over the radio with a tone and will broadcast its current observations.

Not every station runs all year. The standard allows seasonal stations that operate only through the designated fire season, and failures found after the season are repaired before the station starts up for the next one. A station without a winterized rain gauge will often show a large rain event in early spring, which the standard attributes to normal thawing.

_Curious about the network? Get in touch via the [contact page](/contact)._
