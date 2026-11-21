/**
 * IPTV Navigator PRO v4.0 - Field Discovery Engine
 * Descubre dinámicamente todos los campos disponibles en los canales
 */

class FieldDiscoveryEngine {

    /**
     * Escanea todos los canales y descubre campos disponibles
     * @param {Array} channels - Array de canales de todos los servidores
     * @returns {Object} { allFields, commonFields, fieldDefinitions }
     */
    discoverFields(channels) {
        if (!channels || !channels.length) {
            return { allFields: [], commonFields: [], fieldDefinitions: [] };
        }

        // 1. Recolectar todos los campos únicos
        const allFieldsSet = new Set();
        const fieldsByChannel = [];

        for (const channel of channels) {
            const fields = Object.keys(channel);
            fieldsByChannel.push(fields);
            fields.forEach(f => allFieldsSet.add(f));
        }

        const allFields = Array.from(allFieldsSet);

        // 2. Calcular campos comunes (presentes en al menos 80% de canales)
        const threshold = Math.floor(channels.length * 0.8);
        const fieldCounts = {};

        for (const fields of fieldsByChannel) {
            for (const field of fields) {
                fieldCounts[field] = (fieldCounts[field] || 0) + 1;
            }
        }

        const commonFields = allFields.filter(f => fieldCounts[f] >= threshold);

        // 3. Generar definiciones de campos con tipos inferidos
        const fieldDefinitions = allFields.map(fieldName => {
            const samples = this.getSamples(channels, fieldName, 100);
            const type = this.inferType(samples);
            const values = type === 'enum' ? this.getUniqueValues(samples) : null;

            return {
                id: fieldName,
                label: this.prettifyFieldName(fieldName),
                type: type,
                values: values,
                isCommon: commonFields.includes(fieldName),
                coverage: (fieldCounts[fieldName] / channels.length) * 100
            };
        });

        // Ordenar por cobertura descendente
        fieldDefinitions.sort((a, b) => b.coverage - a.coverage);

        return {
            allFields,
            commonFields,
            fieldDefinitions
        };
    }

    /**
     * Obtiene muestras de valores de un campo
     */
    getSamples(channels, fieldName, maxSamples = 100) {
        const samples = [];

        for (const channel of channels) {
            if (channel.hasOwnProperty(fieldName) && channel[fieldName] != null) {
                samples.push(channel[fieldName]);
                if (samples.length >= maxSamples) break;
            }
        }

        return samples;
    }

    /**
     * Infiere el tipo de dato de un campo
     */
    inferType(samples) {
        if (!samples.length) return 'text';

        const types = {
            number: 0,
            boolean: 0,
            array: 0,
            object: 0,
            text: 0
        };

        for (const sample of samples) {
            if (typeof sample === 'number') types.number++;
            else if (typeof sample === 'boolean') types.boolean++;
            else if (Array.isArray(sample)) types.array++;
            else if (typeof sample === 'object') types.object++;
            else types.text++;
        }

        // Si >80% son del mismo tipo, ese es el tipo
        const total = samples.length;
        if (types.number / total > 0.8) return 'number';
        if (types.boolean / total > 0.8) return 'boolean';
        if (types.array / total > 0.8) return 'tags'; // Arrays se tratan como tags

        // Para text, verificar si es enum (pocos valores únicos)
        if (types.text / total > 0.5) {
            const unique = new Set(samples);
            if (unique.size <= 20) return 'enum'; // Máximo 20 valores únicos = enum
        }

        return 'text';
    }

    /**
     * Obtiene valores únicos para campos enum
     */
    getUniqueValues(samples) {
        const unique = new Set();
        for (const sample of samples) {
            if (sample != null && sample !== '') {
                unique.add(String(sample));
            }
        }
        return Array.from(unique).sort();
    }

    /**
     * Convierte nombre de campo a formato legible
     */
    prettifyFieldName(fieldName) {
        // Casos especiales
        const specialCases = {
            'tvg-id': 'EPG ID',
            'tvg-name': 'Nombre EPG',
            'tvg-logo': 'Logo',
            'tvg-country': 'País',
            'tvg-language': 'Idioma',
            'group-title': 'Grupo',
            'streamUrl': 'URL Stream',
            'avgBitrateKbps': 'Bitrate (kbps)',
            'qualityTags': 'Tags de Calidad',
            'codecFamily': 'Codec',
            'transportFormatCode': 'Formato',
            'bitrateTierCode': 'Tier'
        };

        if (specialCases[fieldName]) return specialCases[fieldName];

        // Convertir camelCase o snake_case a Title Case
        return fieldName
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.FieldDiscoveryEngine = FieldDiscoveryEngine;
}
