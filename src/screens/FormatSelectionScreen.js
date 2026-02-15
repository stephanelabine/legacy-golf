import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const formats = [
    { id: 'kps', label: 'KP', selected: false },
    { id: 'longDrive', label: 'Long Drive', selected: false },
    { id: 'skins', label: 'Skins', selected: false },
    { id: 'putting', label: 'Putting Contest', selected: false },
];

export default function FormatSelectionScreen() {
    const [selectedFormats, setSelectedFormats] = useState(formats);

    const toggleFormat = (id) => {
        const updatedFormats = selectedFormats.map((format) =>
            format.id === id ? { ...format, selected: !format.selected } : format
        );
        setSelectedFormats(updatedFormats);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Select Formats</Text>
            <View style={styles.formatsList}>
                {selectedFormats.map((format) => (
                    <Pressable
                        key={format.id}
                        style={[styles.formatBox, format.selected && styles.selectedBox]}
                        onPress={() => toggleFormat(format.id)}
                    >
                        <Text style={styles.formatLabel}>{format.label}</Text>
                    </Pressable>
                ))}
            </View>
            <Pressable style={styles.nextButton} onPress={() => console.log('Go to next screen')}>
                <Text style={styles.nextText}>Next: Confirm Wagers & Formats</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    formatsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    formatBox: {
        width: 100,
        height: 100,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    selectedBox: {
        backgroundColor: '#2e7dff',
        borderColor: '#1a5bb8',
    },
    formatLabel: { fontSize: 16, color: '#333' },
    nextButton: {
        marginTop: 20,
        backgroundColor: '#2e7dff',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    nextText: { fontSize: 18, color: '#fff' },
});
