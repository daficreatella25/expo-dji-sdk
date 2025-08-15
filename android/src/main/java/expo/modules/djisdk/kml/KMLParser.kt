package expo.modules.djisdk.kml

import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.File
import java.io.StringReader
import android.util.Log

data class KMLWaypoint(
    val longitude: Double,
    val latitude: Double,
    val altitude: Double,
    val name: String? = null
)

data class KMLMission(
    val name: String,
    val waypoints: MutableList<KMLWaypoint> = mutableListOf(),
    val altitudeMode: String = "absolute"
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
                                    val waypoints = parseCoordinates(parser.text, altitudeMode)
                                    mission.waypoints.addAll(waypoints)
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
            return mission.copy(name = missionName)

        } catch (e: Exception) {
            Log.e(TAG, "Error parsing KML: ${e.message}")
            throw e
        }
    }

    private fun parseCoordinates(coordinatesText: String, altitudeMode: String): List<KMLWaypoint> {
        val waypoints = mutableListOf<KMLWaypoint>()

        // Split by whitespace and parse each coordinate triplet
        val coordPairs = coordinatesText.trim().split("\\s+".toRegex())

        coordPairs.forEach { coordString ->
            val trimmed = coordString.trim()
            if (trimmed.isNotEmpty()) {
                val parts = trimmed.split(",")
                if (parts.size >= 2) {
                    try {
                        val longitude = parts[0].toDouble()
                        val latitude = parts[1].toDouble()
                        val altitude = if (parts.size >= 3) {
                            parts[2].toDouble()
                        } else {
                            0.0
                        }

                        waypoints.add(KMLWaypoint(longitude, latitude, altitude))
                    } catch (e: NumberFormatException) {
                        Log.w(TAG, "Failed to parse coordinate: $coordString")
                    }
                }
            }
        }

        return waypoints
    }
}