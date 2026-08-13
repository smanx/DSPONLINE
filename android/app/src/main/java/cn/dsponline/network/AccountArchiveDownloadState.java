package cn.dsponline.network;

final class AccountArchiveDownloadState {

    enum Phase { DOWNLOADING, READY, SHARING, COMPLETED, CANCELLED }

    enum CancelResult { CANCELLED, TOO_LATE, COMPLETED }

    private Phase phase = Phase.DOWNLOADING;

    synchronized void markReady() throws AccountArchiveProtocol.ArchiveException {
        if (phase == Phase.CANCELLED) throw cancelled();
        if (phase != Phase.DOWNLOADING) throw new IllegalStateException("Archive state cannot become ready");
        phase = Phase.READY;
    }

    synchronized void beginSharing() throws AccountArchiveProtocol.ArchiveException {
        if (phase == Phase.CANCELLED) throw cancelled();
        if (phase != Phase.READY) throw new IllegalStateException("Archive state cannot begin sharing");
        phase = Phase.SHARING;
    }

    synchronized void markCompleted() {
        if (phase == Phase.SHARING) phase = Phase.COMPLETED;
    }

    synchronized CancelResult cancel() {
        if (phase == Phase.DOWNLOADING || phase == Phase.READY) {
            phase = Phase.CANCELLED;
            return CancelResult.CANCELLED;
        }
        if (phase == Phase.SHARING) return CancelResult.TOO_LATE;
        return CancelResult.COMPLETED;
    }

    synchronized boolean isCancelled() {
        return phase == Phase.CANCELLED;
    }

    private AccountArchiveProtocol.ArchiveException cancelled() {
        return new AccountArchiveProtocol.ArchiveException("ACCOUNT_ARCHIVE_CANCELLED", "账号归档下载已取消");
    }
}
