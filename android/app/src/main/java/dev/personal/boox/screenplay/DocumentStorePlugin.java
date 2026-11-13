package dev.personal.boox.screenplay;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.database.Cursor;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Thin Storage Access Framework bridge. Picks files and folders, keeps permanent access,
 * and reads/writes through ContentResolver. No business logic.
 */
@CapacitorPlugin(name = "DocumentStore")
public class DocumentStorePlugin extends Plugin {
    private static final String SIDECAR_DIR = ".scriptwriter";

    private static final int RW =
        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    @PluginMethod
    public void pickOpen(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "fileResult");
    }

    @PluginMethod
    public void pickCreate(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TITLE, call.getString("suggestedName", "Untitled.fountain"));
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "fileResult");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "folderResult");
    }

    @ActivityCallback
    private void fileResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        Uri uri = uriFrom(result);
        if (uri != null) {
            persist(uri);
            out.put("uri", uri.toString());
            out.put("name", displayName(uri));
        }
        call.resolve(out);
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        Uri uri = uriFrom(result);
        if (uri != null) {
            persist(uri);
            out.put("uri", uri.toString());
        }
        call.resolve(out);
    }

    private Uri uriFrom(ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) return null;
        return result.getData().getData();
    }

    private void persist(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, RW);
        } catch (SecurityException ignored) {
            // Some providers don't offer persistable grants; access lasts until the app is killed.
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver()
                .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        return uri.getLastPathSegment();
    }

    @PluginMethod
    public void listFolder(PluginCall call) {
        String folderUri = call.getString("folderUri");
        if (folderUri == null) {
            call.reject("Cannot open folder");
            return;
        }
        Uri tree = Uri.parse(folderUri);
        // One ContentResolver query for the whole listing (listFiles() queries once per file).
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
            tree, DocumentsContract.getTreeDocumentId(tree));
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        };
        JSArray files = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String mime = c.getString(2);
                String name = c.getString(1);
                if (name == null || DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) continue;
                JSObject o = new JSObject();
                o.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0)).toString());
                o.put("name", name);
                files.put(o);
            }
        } catch (Exception e) {
            call.reject("Cannot list folder: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("files", files);
        call.resolve(out);
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            JSObject out = new JSObject();
            out.put("text", readUri(Uri.parse(call.getString("uri"))));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            writeUri(Uri.parse(call.getString("uri")), call.getString("text", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage());
        }
    }

    private String readUri(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("No stream");
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void writeUri(Uri uri, String text) throws Exception {
        // "wt" truncates, so a shorter document doesn't leave old bytes behind.
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new Exception("No stream");
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private DocumentFile folder(String uri) {
        return uri == null ? null : DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
    }

    private DocumentFile sidecarDir(PluginCall call, boolean create) {
        String folderUri = call.getString("folderUri");
        String dirName = call.getString("dir", SIDECAR_DIR);
        DocumentFile root = folder(folderUri);
        if (root == null) return null;
        DocumentFile d = root.findFile(dirName);
        if (d == null && create) d = root.createDirectory(dirName);
        return d;
    }

    @PluginMethod
    public void sidecarList(PluginCall call) {
        JSArray names = new JSArray();
        DocumentFile d = sidecarDir(call, false);
        if (d != null) {
            for (DocumentFile f : d.listFiles()) if (f.getName() != null) names.put(f.getName());
        }
        JSObject out = new JSObject();
        out.put("names", names);
        call.resolve(out);
    }

    @PluginMethod
    public void sidecarRead(PluginCall call) {
        try {
            DocumentFile d = sidecarDir(call, false);
            DocumentFile f = d == null ? null : d.findFile(call.getString("name"));
            JSObject out = new JSObject();
            out.put("text", f == null ? null : readUri(f.getUri()));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sidecarWrite(PluginCall call) {
        try {
            DocumentFile d = sidecarDir(call, true);
            if (d == null) throw new Exception("No sidecar folder");
            String name = call.getString("name");
            DocumentFile f = d.findFile(name);
            if (f == null) f = d.createFile("text/plain", name);
            if (f == null) throw new Exception("Cannot create " + name);
            writeUri(f.getUri(), call.getString("text", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sidecarRemove(PluginCall call) {
        DocumentFile d = sidecarDir(call, false);
        DocumentFile f = d == null ? null : d.findFile(call.getString("name"));
        if (f != null) f.delete();
        call.resolve();
    }
}
