// Auto-bundled demo mission so the example can launch a known mission without
// downloading/uploading a KML by hand. Source file:
//   mission-883edcfd-b514-428e-a3fa-3ea0f95e516a.kml (Oma Pesona Buduran - Rooftop Inspection, 7 waypoints)
// Regenerate by re-embedding the KML content below.

export const BUNDLED_MISSION_NAME = 'Oma Pesona Buduran - Rooftop Inspection';

export const BUNDLED_MISSION_KML = `
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
<Document>
    <name>Oma Pesona Buduran - Rooftop Inspection</name>
    <Style id="poi-marker-style">
        <IconStyle>
            <color>ff984b00</color>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
            </Icon>
        </IconStyle>
        <BalloonStyle>
            <text>
                $[description]
            </text>
      </BalloonStyle>
    </Style>
    <Style id="wp-marker-style">
        <IconStyle>
            <color>ffff0076</color>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
            </Icon>
        </IconStyle>
        <BalloonStyle>
            <text>
                $[description]
            </text>
      </BalloonStyle>
    </Style>
    <StyleMap id="wpline-style">
        <Pair>
            <key>normal</key>
            <styleUrl>#wpline-style-normal</styleUrl>
        </Pair>
        <Pair>
            <key>highlight</key>
            <styleUrl>#wpline-style-highlight</styleUrl>
        </Pair>
    </StyleMap>
    <Style id="wpline-style-normal">
        <LineStyle>
            <color>ff00ffff</color>
            <width>3</width>
        </LineStyle>
        <PolyStyle>
            <color>5000ffff</color>
            <outline>0</outline>
        </PolyStyle>
    </Style>
    <Style id="wpline-style-highlight">
        <LineStyle>
            <color>ff00ffff</color>
            <width>3</width>
        </LineStyle>
        <PolyStyle>
            <color>5000ffff</color>
        </PolyStyle>
    </Style>
    <LookAt>
        <gx:horizFov>69.72645906888525</gx:horizFov>
        <latitude>-7.4260126</latitude>
        <longitude>112.69752060333333</longitude>
        <altitude>34.5</altitude>
        <altitudeMode>absolute</altitudeMode>
        <heading>0</heading>
        <tilt>67.5</tilt>
        <range>50</range>
    </LookAt>
    <Folder>
        <name>Waypoints</name>
        <Placemark>
            <name>WP 1</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.69747111,-7.42606304,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 1</h3>
                -7.426063, 112.697471
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 082°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 82°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42606304</latitude>
                    <longitude>112.69747111</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>81.75225840211061</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
        <Placemark>
            <name>WP 2</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.69756364,-7.42604974,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 2</h3>
                -7.426050, 112.697564
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 000°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 0°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42604974</latitude>
                    <longitude>112.69756364</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>0</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
        <Placemark>
            <name>WP 3</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.69756364,-7.42600053,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 3</h3>
                -7.426001, 112.697564
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 322°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 322°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42600053</latitude>
                    <longitude>112.69756364</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>321.5826127516603</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
        <Placemark>
            <name>WP 4</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.6975328,-7.42596197,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 4</h3>
                -7.425962, 112.697533
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 253°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 253°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42596197</latitude>
                    <longitude>112.6975328</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>252.71682080155978</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
        <Placemark>
            <name>WP 5</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.69747245,-7.42598059,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 5</h3>
                -7.425981, 112.697472
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 130°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 130°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42598059</latitude>
                    <longitude>112.69747245</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>129.7077753222186</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
        <Placemark>
            <name>WP 6</name>
            <styleUrl>#wp-marker-style</styleUrl>
            <Point>
                <extrude>1</extrude>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>112.69751998,-7.42601973,34.5</coordinates>
            </Point>
            <description><![CDATA[
                <h3>WP 6</h3>
                -7.426020, 112.697520
            <br>
            ATL 35m<br>AGL 35m<br>Elevation 0m (+0m)
            <br>
            <span style="display:inline-flex;align-items:center;margin-right:6px"><span class="material-icons-outlined md-12" style="margin-right:2px">navigation</span> 130°</span>
            <span style="display:inline-flex;align-items:center"><span class="material-icons-outlined md-12" style="margin-right:2px">videocam</span> <span style="font-family: monospace">+</span>00°</span>
                <br>
                Heading 130°
                <br>
                Gimbal Pitch 0°
            ]]></description>
            <Camera>
                    <gx:horizFov>69.72645906888525</gx:horizFov>
                    <latitude>-7.42601973</latitude>
                    <longitude>112.69751998</longitude>
                    <altitude>34.5</altitude>
                    <altitudeMode>absolute</altitudeMode>
                    <heading>129.7077753222186</heading>
                    <tilt>90</tilt>
            </Camera>
        </Placemark>
    </Folder>
    <Folder>
        <name>POIs</name>
    </Folder>
    <Placemark>
        <name>Waypoint Path</name>
        <styleUrl>#wpline-style</styleUrl>
        <LineString>
            <extrude>1</extrude>
            <tessellate>1</tessellate>
            <altitudeMode>absolute</altitudeMode>
            <coordinates>112.69747111,-7.42606304,34.5 112.69756364,-7.42604974,34.5 112.69756364,-7.42600053,34.5 112.6975328,-7.42596197,34.5 112.69747245,-7.42598059,34.5 112.69751998,-7.42601973,34.5</coordinates>
        </LineString>
    </Placemark>
</Document>
</kml>`;
