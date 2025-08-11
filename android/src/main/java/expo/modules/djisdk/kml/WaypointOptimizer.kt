package expo.modules.djisdk.kml

import android.util.Log
import kotlin.math.*

class WaypointOptimizer {
    companion object {
        private const val TAG = "WaypointOptimizer"
        private const val EARTH_RADIUS = 6371000.0 // Earth radius in meters
    }

    fun optimizeWaypoints(
        waypoints: List<KMLWaypoint>,
        minDistance: Double = 2.0, // meters
        maxWaypoints: Int = 99 // DJI limit
    ): List<KMLWaypoint> {
        if (waypoints.isEmpty()) return emptyList()
        if (waypoints.size <= 2) return waypoints

        Log.d(TAG, "Optimizing ${waypoints.size} waypoints with minDistance=$minDistance")

        val optimized = mutableListOf<KMLWaypoint>()
        optimized.add(waypoints.first()) // Always keep start point

        for (i in 1 until waypoints.size - 1) {
            val current = waypoints[i]
            val lastAdded = optimized.last()

            // Calculate distance between points
            val distance = calculateDistance(
                lastAdded.latitude, lastAdded.longitude,
                current.latitude, current.longitude
            )

            // Only add if distance is significant
            if (distance >= minDistance) {
                optimized.add(current)
            }

            // Break if we reach max waypoints
            if (optimized.size >= maxWaypoints - 1) break
        }

        // Always keep end point if different from start
        if (waypoints.size > 1) {
            val endPoint = waypoints.last()
            val startPoint = waypoints.first()
            
            if (calculateDistance(
                    startPoint.latitude, startPoint.longitude,
                    endPoint.latitude, endPoint.longitude
                ) > minDistance) {
                optimized.add(endPoint)
            }
        }

        Log.d(TAG, "Optimized to ${optimized.size} waypoints")
        return optimized
    }

    fun calculateMissionStats(waypoints: List<KMLWaypoint>): MissionStats {
        if (waypoints.isEmpty()) return MissionStats(0.0, 0.0, 0.0, 0.0)

        var totalDistance = 0.0
        var minAltitude = waypoints.first().altitude
        var maxAltitude = waypoints.first().altitude

        for (i in 1 until waypoints.size) {
            val prev = waypoints[i - 1]
            val current = waypoints[i]

            // Calculate 3D distance
            val horizontalDistance = calculateDistance(
                prev.latitude, prev.longitude,
                current.latitude, current.longitude
            )
            val verticalDistance = abs(current.altitude - prev.altitude)
            val distance3D = sqrt(horizontalDistance.pow(2) + verticalDistance.pow(2))

            totalDistance += distance3D

            // Track altitude range
            minAltitude = min(minAltitude, current.altitude)
            maxAltitude = max(maxAltitude, current.altitude)
        }

        return MissionStats(
            totalDistance = totalDistance,
            minAltitude = minAltitude,
            maxAltitude = maxAltitude,
            altitudeRange = maxAltitude - minAltitude
        )
    }

    private fun calculateDistance(
        lat1: Double, lon1: Double,
        lat2: Double, lon2: Double
    ): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)

        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)

        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return EARTH_RADIUS * c
    }
}

data class MissionStats(
    val totalDistance: Double,
    val minAltitude: Double,
    val maxAltitude: Double,
    val altitudeRange: Double
)