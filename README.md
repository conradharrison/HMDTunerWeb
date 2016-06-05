HMD Tuner
==================================

HMD Tuner is a tool for deriving the viewer device profile.
You can use this tool estimate the lens and device parameters for any Android phone based HMD.

Development
========================

Overview
--------

The tool assists you in deriving the set of parameters that characterises a viewing device.
Some parameters are a simple matter of entering text in a form (e.g. for vendor name),
while others require interactive calibration while looking at a scene
within the viewer (e.g. for distortion correction). Therefore the tool has two
components: 1) form entry and instructions running on a PC or laptop having a
keyboard, and 2) a simple 3D app running on an Android phone placed into your viewer.
The two components sync data in real-time via the Firebase service, allowing
the rendering parameters to be updated dynamically as you change fields in
the form.