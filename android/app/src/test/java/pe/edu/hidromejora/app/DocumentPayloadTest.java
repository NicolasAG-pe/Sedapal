package pe.edu.hidromejora.app;

import org.junit.Test;
import static org.junit.Assert.assertThrows;

public class DocumentPayloadTest {
    @Test public void acceptsPdfAndDescriptiveName() {
        DocumentPayload.validate("Recibo_HidroMejora_900000002_2026-10.pdf", "%PDF-1.7".getBytes());
    }
    @Test public void rejectsPathsAndOtherFormats() {
        for (String name : new String[]{"../cuenta.pdf", "documento.apk", "/tmp/doc.pdf", "a.pdf.exe"}) {
            assertThrows(IllegalArgumentException.class, () -> DocumentPayload.validate(name, "%PDF-1.7".getBytes()));
        }
        assertThrows(IllegalArgumentException.class, () -> DocumentPayload.validate("doc.pdf", "<html>".getBytes()));
    }
    @Test public void enforcesDocumentSize() {
        byte[] oversized = new byte[DocumentPayload.MAX_BYTES + 1];
        assertThrows(IllegalArgumentException.class, () -> DocumentPayload.validate("doc.pdf", oversized));
    }
}
