package cn.dsponline.network;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AccountArchiveDownloadStateTest {

    @Test
    public void cancellationWinsBeforeSharingAndCannotRacePastTheChooserBoundary() throws Exception {
        AccountArchiveDownloadState beforeReady = new AccountArchiveDownloadState();
        assertEquals(AccountArchiveDownloadState.CancelResult.CANCELLED, beforeReady.cancel());
        assertTrue(beforeReady.isCancelled());
        assertThrows(AccountArchiveProtocol.ArchiveException.class, beforeReady::markReady);

        AccountArchiveDownloadState ready = new AccountArchiveDownloadState();
        ready.markReady();
        assertEquals(AccountArchiveDownloadState.CancelResult.CANCELLED, ready.cancel());
        assertThrows(AccountArchiveProtocol.ArchiveException.class, ready::beginSharing);

        AccountArchiveDownloadState sharing = new AccountArchiveDownloadState();
        sharing.markReady();
        sharing.beginSharing();
        assertEquals(AccountArchiveDownloadState.CancelResult.TOO_LATE, sharing.cancel());
        sharing.markCompleted();
        assertEquals(AccountArchiveDownloadState.CancelResult.COMPLETED, sharing.cancel());
    }
}
