package expo.modules.djisdk.kml

import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.File
import java.io.StringReader
import android.util.Log
import kotlin.math.abs

data class KMLWaypoint(
    val longitude: Double,
    val latitude: Double,
    val altitude: Double,
    val name: String? = null,
    /** False when the coordinate had no (readable) altitude; altitude is then 0 and must not be flown. */
    val hasAltitude: Boolean = true
)

data class KMLMission(
    val name: String,
    val waypoints: MutableList<KMLWaypoint> = mutableListOf(),
    val altitudeMode: String = "absolute",
    /** Coordinates that could not be read at all (dropped from waypoints). */
    val skippedCoordinates: Int = 0
)

class KMLParser {
    companion object {
        private const val TAG = "KMLParser"
    }

    fun parseKMLFile(filePath: String): KMLMission {
        val fileContent = File(filePath).readText()
        return parseKML(fileContent)
    }

    fun parseKML(kmlContent: String): KMLMission {
        val mission = KMLMission(name = "KML Mission", waypoints = mutableListOf())
        var skipped = 0

        try {
            val factory = XmlPullParserFactory.newInstance()
            val parser = factory.newPullParser()
            parser.setInput(StringReader(kmlContent))

            var eventType = parser.eventType
            var currentElement = ""
            var inPlacemark = false
            var inLineString = false
            var altitudeMode = "absolute"
            var missionName = "KML Mission"

            while (eventType != XmlPullParser.END_DOCUMENT) {
                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        currentElement = parser.name
                        when (currentElement) {
                            "Placemark" -> inPlacemark = true
                            "LineString" -> inLineString = true
                            "name" -> {
                                if (parser.next() == XmlPullParser.TEXT) {
                                    val name = parser.text
                                    if (!inPlacemark && name.isNotBlank()) {
                                        missionName = name
                                    }
                                }
                            }
                            "altitudeMode" -> {
                                if (parser.next() == XmlPullParser.TEXT) {
                                    altitudeMode = parser.text
                                }
                            }
                            "coordinates" -> {
                                if (inLineString && parser.next() == XmlPullParser.TEXT) {
                                    val (waypoints, unreadable) = parseCoordinates(parser.text, altitudeMode)
                                    mission.waypoints.addAll(waypoints)
                                    skipped += unreadable
                                }
                            }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        when (parser.name) {
                            "Placemark" -> inPlacemark = false
                            "LineString" -> inLineString = false
                        }
                    }
                }
                eventType = parser.next()
            }

            Log.d(TAG, "Parsed ${mission.waypoints.size} waypoints from KML")
            return mission.copy(name = missionName, skippedCoordinates = skipped)

        } catch (e: Exception) {
            Log.e(TAG, "Error parsing KML: ${e.message}")
            throw e
        }
    }

    /** The waypoints, and how many coordinates could not be read. */
    private fun parseCoordinates(coordinatesText: String, altitudeMode: String): Pair<List<KMLWaypoint>, Int> {
        val waypoints = mutableListOf<KMLWaypoint>()
        var skipped = 0

        // Split by whitespace and parse each coordinate triplet
        val coordPairs = coordinatesText.trim().split("\\s+".toRegex())

        coordPairs.forEach { coordString ->
            val trimmed = coordString.trim()
            if (trimmed.isNotEmpty()) {
                val parts = trimmed.split(",")
                val longitude = parts.getOrNull(0)?.trim()?.toDoubleOrNull()
                val latitude = parts.getOrNull(1)?.trim()?.toDoubleOrNull()
                if (longitude == null || latitude == null || !longitude.isFinite() || !latitude.isFinite() ||
                    abs(latitude) > 90.0 || abs(longitude) > 180.0) {
                    // Counted, not silently dropped: a route missing a point must not fly.
                    skipped++
                    Log.w(TAG, "Failed to parse coordinate: $coordString")
                } else {
                    // A missing altitude is kept as a flag (not 0 m) so the import can refuse it.
                    val altitude = parts.getOrNull(2)?.trim()?.toDoubleOrNull()?.takeIf { it.isFinite() }
                    waypoints.add(KMLWaypoint(longitude, latitude, altitude ?: 0.0, hasAltitude = altitude != null))
                }
            }
        }

        return Pair(waypoints, skipped)
    }
}