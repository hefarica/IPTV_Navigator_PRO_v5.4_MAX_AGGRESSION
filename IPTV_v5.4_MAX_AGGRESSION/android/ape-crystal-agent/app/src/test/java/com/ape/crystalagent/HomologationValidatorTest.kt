package com.ape.crystalagent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets

class HomologationValidatorTest {

    private fun referenceBytes(): ByteArray =
        javaClass.classLoader!!.getResourceAsStream("homologation_reference.json")!!.use { it.readBytes() }

    @Test
    fun referenceIsValidAndShowsNotAppliedCounts() {
        val result = HomologationValidator.validate(referenceBytes())
        assertTrue(result.structure.detail, result.structure.ok)
        assertTrue(result.integrity.detail, result.integrity.ok)
        assertTrue(result.plans.detail, result.plans.ok)
        assertTrue(result.valid)
        assertEquals(12, result.profiles)
        assertEquals(5, result.filterProfiles)
        assertEquals(60, result.plansCount)
        assertEquals("38ffd7a8cdb5050e9424298303495fdd79b33d13e7912cf73f2f0310c8805577", result.sha256)
    }

    @Test
    fun alteredSelfHashIsRejectedWithoutChangingStructureOrPlans() {
        val text = String(referenceBytes(), StandardCharsets.UTF_8)
            .replaceFirst("38ffd7a8cdb5050e9424298303495fdd79b33d13e7912cf73f2f0310c8805577", "0".repeat(64))
        val result = HomologationValidator.validate(text.toByteArray(StandardCharsets.UTF_8))
        assertTrue(result.structure.ok)
        assertFalse(result.integrity.ok)
        assertTrue(result.plans.ok)
        assertFalse(result.valid)
    }

    @Test
    fun alteredPlanGeometryIsRejected() {
        val text = String(referenceBytes(), StandardCharsets.UTF_8)
            .replaceFirst(Regex("\"active_px\":\\s*\\[\\s*2880,\\s*2160\\s*\\]"), "\"active_px\": [2882, 2160]")
        val result = HomologationValidator.validate(text.toByteArray(StandardCharsets.UTF_8))
        assertTrue(result.structure.ok)
        assertFalse(result.plans.ok)
        assertFalse(result.valid)
    }

    @Test
    fun truncatedJsonIsRejected() {
        val bytes = referenceBytes()
        val result = HomologationValidator.validate(bytes.copyOf(bytes.size - 100))
        assertFalse(result.structure.ok)
        assertFalse(result.integrity.ok)
        assertFalse(result.plans.ok)
        assertFalse(result.valid)
    }

    @Test
    fun duplicateKeysAreRejected() {
        val duplicate = "{\"_meta\":{\"type\":\"all_profiles\"},\"_meta\":{}}".toByteArray(StandardCharsets.UTF_8)
        val result = HomologationValidator.validate(duplicate)
        assertFalse(result.structure.ok)
        assertFalse(result.valid)
        assertTrue(result.structure.detail.contains("duplicada"))
    }
}
