package cn.dsponline.network;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;

public class AccountArchiveProtocolTest {

    @Test
    public void buildsOnlyTheFixedHttpsArchiveEndpoint() throws Exception {
        URI endpoint = AccountArchiveProtocol.archiveEndpoint("https://API.Example.Test:443/api/");
        assertEquals("https://api.example.test/api/account/export/archive", endpoint.toString());
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.archiveEndpoint("http://api.example.test/api")
        );
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.archiveEndpoint("https://api.example.test/proxy/api")
        );
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.archiveEndpoint("https://user@api.example.test/api")
        );
    }

    @Test
    public void validatesRequestIdsLengthsMimeAndArchiveVersion() throws Exception {
        assertEquals("archive_request_0001", AccountArchiveProtocol.requiredRequestId("archive_request_0001"));
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.requiredRequestId("../escape")
        );
        assertEquals(30L * 1024L * 1024L, AccountArchiveProtocol.requiredContentLength(Integer.toString(30 * 1024 * 1024)));
        assertThrows(AccountArchiveProtocol.ArchiveException.class, () -> AccountArchiveProtocol.requiredContentLength("0"));
        assertThrows(AccountArchiveProtocol.ArchiveException.class, () -> AccountArchiveProtocol.requiredContentLength("-1"));
        assertThrows(AccountArchiveProtocol.ArchiveException.class, () -> AccountArchiveProtocol.requiredContentLength("unknown"));
        AccountArchiveProtocol.validateResponseMetadata(
            "application/vnd.dspidle.account-archive+zip; charset=binary",
            "2"
        );
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.validateResponseMetadata("application/zip", "2")
        );
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.validateResponseMetadata(AccountArchiveProtocol.CONTENT_TYPE, "1")
        );
    }

    @Test
    public void sanitizesNamesWithoutAllowingPathInjection() {
        String name = AccountArchiveProtocol.safeArchiveFileName("../folder\\CON.zip");
        assertTrue(name.endsWith(AccountArchiveProtocol.FILE_SUFFIX));
        assertTrue(name.startsWith("_CON"));
        assertTrue(!name.contains("/") && !name.contains("\\"));
        assertEquals(
            "player.dspaccount.zip",
            AccountArchiveProtocol.safeArchiveFileName("player.dspaccount.zip")
        );
    }

    @Test
    public void streamsExactBytesAndRejectsTruncationOverflowAndCancellation() throws Exception {
        byte[] payload = "synthetic-account-archive".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertEquals(
            payload.length,
            AccountArchiveProtocol.copyExact(
                new ByteArrayInputStream(payload),
                output,
                payload.length,
                () -> false
            )
        );
        assertEquals(new String(payload, StandardCharsets.UTF_8), output.toString(StandardCharsets.UTF_8.name()));
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.copyExact(
                new ByteArrayInputStream(payload),
                new ByteArrayOutputStream(),
                payload.length + 1L,
                () -> false
            )
        );
        assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.copyExact(
                new ByteArrayInputStream(payload),
                new ByteArrayOutputStream(),
                payload.length - 1L,
                () -> false
            )
        );
        AtomicBoolean cancelled = new AtomicBoolean(true);
        AccountArchiveProtocol.ArchiveException aborted = assertThrows(
            AccountArchiveProtocol.ArchiveException.class,
            () -> AccountArchiveProtocol.copyExact(
                new ByteArrayInputStream(payload),
                new ByteArrayOutputStream(),
                payload.length,
                cancelled::get
            )
        );
        assertEquals("ACCOUNT_ARCHIVE_CANCELLED", aborted.code);
    }

    @Test
    public void mapsStableHttpErrorsWithoutReflectingUntrustedCodes() {
        assertEquals("ACCOUNT_ARCHIVE_AUTH_REQUIRED", AccountArchiveProtocol.httpError(401, "AUTH_REQUIRED").code);
        assertEquals("ACCOUNT_ARCHIVE_UNSUPPORTED", AccountArchiveProtocol.httpError(404, "NOT_FOUND").code);
        assertEquals("ACCOUNT_ARCHIVE_HTTP_ERROR", AccountArchiveProtocol.httpError(500, "bad code").code);
        assertEquals(null, AccountArchiveProtocol.httpError(500, "bad code").serverCode);
    }

    @Test
    public void streamsThirtyMiBThroughBoundedChunksWithoutMaterializingTheArchive() throws Exception {
        final long expectedBytes = 30L * 1024L * 1024L;
        InputStream generated = new InputStream() {
            long remaining = expectedBytes;

            @Override
            public int read() {
                if (remaining <= 0) return -1;
                remaining -= 1;
                return 0x5a;
            }

            @Override
            public int read(byte[] buffer, int offset, int length) {
                if (remaining <= 0) return -1;
                int count = (int) Math.min(remaining, Math.min(length, 16 * 1024));
                java.util.Arrays.fill(buffer, offset, offset + count, (byte) 0x5a);
                remaining -= count;
                return count;
            }
        };
        class CountingOutput extends OutputStream {
            long count;

            @Override
            public void write(int value) {
                count += 1;
            }

            @Override
            public void write(byte[] buffer, int offset, int length) {
                count += length;
            }
        }
        CountingOutput output = new CountingOutput();
        assertEquals(
            expectedBytes,
            AccountArchiveProtocol.copyExact(generated, output, expectedBytes, () -> false)
        );
        assertEquals(expectedBytes, output.count);
    }
}
