package com.eodilog.place.importer;

import java.io.IOException;
import java.io.PushbackReader;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

/** Streams quoted CSV records, including commas and newlines inside quotes. */
final class CsvRecords implements AutoCloseable {
    private final PushbackReader input;
    CsvRecords(Reader input) { this.input = new PushbackReader(input, 1); }

    List<String> next() throws IOException {
        var fields = new ArrayList<String>();
        var value = new StringBuilder();
        boolean quoted = false;
        boolean started = false;
        for (int ch; (ch = input.read()) != -1;) {
            started = true;
            if (ch == '"') {
                if (quoted) {
                    int following = input.read();
                    if (following == '"') value.append('"');
                    else { quoted = false; if (following != -1) input.unread(following); }
                } else if (value.isEmpty()) quoted = true;
                else value.append('"');
            } else if (ch == ',' && !quoted) {
                fields.add(value.toString()); value.setLength(0);
            } else if ((ch == '\n' || ch == '\r') && !quoted) {
                if (ch == '\r') { int following = input.read(); if (following != '\n' && following != -1) input.unread(following); }
                fields.add(value.toString()); return fields;
            } else value.append((char) ch);
        }
        if (quoted) throw new IOException("Unclosed CSV quote");
        if (!started) return null;
        fields.add(value.toString());
        return fields;
    }

    @Override public void close() throws IOException { input.close(); }
}
