// DsaExport: read-only Texture2D / PaperSprite exporter for DragonSword Awakening.
//
//   (the newest *.usmap in <toolsDir>, if any, is used as the mappings file)
//   DsaExport probe  <gameDir> <toolsDir>
//   DsaExport export <gameDir> <toolsDir> <outDir> [gamePathPrefix | @packageListFile]
//   DsaExport list   <gameDir> <toolsDir> <outFile>
//   DsaExport grep   <gameDir> <toolsDir> <outFile> <needle>...   (package headers containing a name)
//   DsaExport schema <gameDir> <toolsDir> <outFile>   (every enum and class/struct in the mappings, as text)
//   DsaExport names  <gameDir> <toolsDir> <package> <outFile>   (name map, import map, export map)
//   DsaExport props  <gameDir> <toolsDir> <package> <exportName>   (which properties an export serializes)
//   DsaExport dump   <gameDir> <toolsDir> <outDir> <package | @packageListFile>   (exports as JSON)
//
// The paks are only ever opened for reading. Without a prefix, export selects every package
// under /Game/Art/UI/ plus any package whose folder path contains Icon, Portrait or Img_.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using CUE4Parse.Compression;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.FileProvider.Objects;
using CUE4Parse.MappingsProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using CUE4Parse.UE4.VirtualFileSystem;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using CUE4Parse_Conversion.Textures.BC;
using Newtonsoft.Json;
using Serilog;

const string AesKey = "0x263479C442D45B7EEDE7B3A36BBB3C3B39EF9178A2F82AB694FB410AB15E01AD";
const string ContentRoot = "DS/Content/";

Log.Logger = new LoggerConfiguration().MinimumLevel.Warning().WriteTo.Console().CreateLogger();

if (args.Length < 3) { Console.Error.WriteLine("usage: DsaExport probe|export <gameDir> <toolsDir> [outDir] [prefix]"); return 2; }
var mode = args[0];
var gameDir = args[1];
var toolsDir = args[2];

await OodleHelper.InitializeAsync(Path.Combine(toolsDir, OodleHelper.OodleFileName));
await ZlibHelper.InitializeAsync(Path.Combine(toolsDir, ZlibHelper.DllName));
var detexDll = Path.Combine(toolsDir, DetexHelper.DLL_NAME); // BC6H/BC7 decoder, embedded in CUE4Parse-Conversion
DetexHelper.LoadDll(detexDll);
DetexHelper.Initialize(detexDll);

var sw = Stopwatch.StartNew();
// DSA_PAKS_DIR overrides the archive folder (used to check paks outside DS\Content\Paks).
var paksDir = Environment.GetEnvironmentVariable("DSA_PAKS_DIR") is { Length: > 0 } d ? d : Path.Combine(gameDir, "DS", "Content", "Paks");
var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly,
    new VersionContainer(Enum.TryParse<EGame>(Environment.GetEnvironmentVariable("DSA_GAME"), out var g) ? g : EGame.GAME_DragonSwordAwakening),
    StringComparer.OrdinalIgnoreCase);
var usmap = Directory.GetFiles(toolsDir, "*.usmap").OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
if (usmap is not null)
{
    provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmap);
    Console.WriteLine($"mappings: {Path.GetFileName(usmap)}");
}
provider.Initialize();
var mounted = await provider.SubmitKeyAsync(new FGuid(), new FAesKey(AesKey));
provider.PostMount();
Console.WriteLine($"mounted {mounted} archives, {provider.Files.Count} files in {sw.Elapsed.TotalSeconds:F1}s");

return mode switch
{
    "probe" => Probe(),
    "inspect" when args.Length >= 4 => Inspect(args[3]),
    "list" when args.Length >= 4 => ListAll(args[3]),
    "raw" when args.Length >= 5 => SaveRaw(args[3], args[4]),
    "grep" when args.Length >= 5 => Grep(args[3], args[4..]),
    "schema" when args.Length >= 4 => Schema(args[3]),
    "names" when args.Length >= 5 => Names(args[3], args[4]),
    "props" when args.Length >= 5 => Props(args[3], args[4]),
    "dump" when args.Length >= 5 => Dump(args[3], args[4]),
    "export" when args.Length >= 4 => Export(args[3], args.Length >= 5 ? args[4] : null),
    _ => 2,
};

// Game path "/Game/Art/X/Y" for a mounted file path "DS/Content/Art/X/Y.uasset".
static string GamePath(GameFile f) => f.PathWithoutExtension.StartsWith(ContentRoot, StringComparison.OrdinalIgnoreCase)
    ? "/Game/" + f.PathWithoutExtension[ContentRoot.Length..]
    : "/" + f.PathWithoutExtension;

// Asset path for an object whose path name is "DS/Content/Art/X/Y.Obj[:Sub]": "/Game/Art/X/Y" when the
// object is the package's main asset (Obj == Y), else "/Game/Art/X/Y.Obj[.Sub]". Sprite-atlas packages
// hold several texture pages (Texture2D_0, Texture2D_5, …), so the object name must stay in the key.
static string AssetPath(UObject o)
{
    var p = o.GetPathName();
    var dot = p.IndexOf('.');
    var pkg = dot < 0 ? p : p[..dot];
    var obj = dot < 0 ? "" : p[(dot + 1)..].Replace(':', '.');
    pkg = pkg.StartsWith(ContentRoot, StringComparison.OrdinalIgnoreCase) ? "/Game/" + pkg[ContentRoot.Length..]
        : pkg.StartsWith('/') ? pkg : "/" + pkg;
    var name = pkg[(pkg.LastIndexOf('/') + 1)..];
    if (obj.StartsWith(name + ".", StringComparison.OrdinalIgnoreCase)) obj = obj[(name.Length + 1)..]; // Atlas.Atlas:Texture2D_0
    return obj.Length == 0 || obj.Equals(name, StringComparison.OrdinalIgnoreCase) ? pkg : pkg + "." + obj;
}

static bool Selected(string gamePath)
{
    if (gamePath.StartsWith("/Game/Art/UI/", StringComparison.OrdinalIgnoreCase)) return true;
    var dir = gamePath[..gamePath.LastIndexOf('/')];
    return dir.Contains("Icon", StringComparison.OrdinalIgnoreCase)
        || dir.Contains("Portrait", StringComparison.OrdinalIgnoreCase)
        || dir.Contains("Img_", StringComparison.OrdinalIgnoreCase);
}

int Probe()
{
    var uassets = provider.Files.Values.Where(f => f.Extension.Equals("uasset", StringComparison.OrdinalIgnoreCase)).ToList();
    var sel = uassets.Where(f => Selected(GamePath(f))).ToList();
    Console.WriteLine($"uasset: {uassets.Count}, selected: {sel.Count}, under Art/UI: {sel.Count(f => GamePath(f).StartsWith("/Game/Art/UI/", StringComparison.OrdinalIgnoreCase))}");
    foreach (var g in sel.GroupBy(f => string.Join('/', GamePath(f).Split('/').Take(4))).OrderByDescending(g => g.Count()).Take(25))
        Console.WriteLine($"  {g.Count(),6}  {g.Key}");
    var gold = uassets.FirstOrDefault(f => f.NameWithoutExtension.Equals("Icon_Item_Common_Gold", StringComparison.OrdinalIgnoreCase));
    Console.WriteLine($"gold: {gold?.Path ?? "(not found)"}");
    if (gold is null) return 1;
    var pkg = provider.LoadPackage(gold);
    Console.WriteLine($"unversioned: {pkg.Summary.bUnversioned}, flags: {pkg.Summary.PackageFlags}");
    foreach (var e in pkg.GetExports())
    {
        Console.WriteLine($"  export {e.Name} : {e.ExportType} ({e.GetType().Name})");
        if (e is UTexture2D t)
        {
            var c = t.Decode();
            Console.WriteLine($"  format {t.Format}, decoded {c?.Width}x{c?.Height} {c?.PixelFormat}");
        }
    }
    return 0;
}

// Writes every mounted file as "<archive>\t<path>" to outFile, and each archive's mount status to stdout.
int ListAll(string outFile)
{
    foreach (var v in provider.MountedVfs.OrderBy(v => v.Name, StringComparer.OrdinalIgnoreCase))
        Console.WriteLine($"mounted   {v.Name}  files {v.FileCount}  mount {v.MountPoint}  encrypted {v.IsEncrypted}");
    foreach (var v in provider.UnloadedVfs.OrderBy(v => v.Name, StringComparer.OrdinalIgnoreCase))
        Console.WriteLine($"UNLOADED  {v.Name}  files {v.FileCount}  encrypted {v.IsEncrypted}  key {v.EncryptionKeyGuid}");
    using var w = new StreamWriter(outFile);
    foreach (var f in provider.Files.Values.OrderBy(f => f.Path, StringComparer.OrdinalIgnoreCase))
        w.WriteLine($"{(f as VfsEntry)?.Vfs.Name}\t{f.Path}");
    Console.WriteLine($"{provider.Files.Count} files written to {outFile}");
    return 0;
}

// Searches the header (.uasset/.umap: name map, import and export tables) of every package for each
// needle, ASCII, case-insensitive. Writes "<game path>	<needle>,<needle>…" per matching package.
int Grep(string outFile, string[] needles)
{
    var pats = needles.Select(n => Encoding.ASCII.GetBytes(n.ToLowerInvariant())).ToArray();
    var files = provider.Files.Values.Where(f => f.Extension.Equals("uasset", StringComparison.OrdinalIgnoreCase)
        || f.Extension.Equals("umap", StringComparison.OrdinalIgnoreCase)).ToList();
    var hits = new ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    var errors = 0;
    Parallel.ForEach(files, f =>
    {
        try
        {
            var b = f.Read();
            for (var i = 0; i < b.Length; i++) if (b[i] is >= (byte)'A' and <= (byte)'Z') b[i] += 32;
            var found = needles.Where((_, i) => b.AsSpan().IndexOf(pats[i]) >= 0).ToArray();
            if (found.Length > 0) hits[GamePath(f) + "." + f.Extension] = string.Join(',', found);
        }
        catch { Interlocked.Increment(ref errors); }
    });
    File.WriteAllLines(outFile, hits.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase).Select(kv => $"{kv.Key}	{kv.Value}"));
    Console.WriteLine($"{files.Count} package headers searched, {hits.Count} matched, {errors} unreadable -> {outFile}");
    return 0;
}

// Writes the mappings' enums ("enum E: 0=A 1=B") and classes/structs ("struct S : Super" then one
// "  Name: Type<Inner,Value> [Enum|Struct]" line per property) to outFile.
int Schema(string outFile)
{
    var m = provider.MappingsForGame ?? throw new InvalidOperationException("no mappings loaded");
    static string T(PropertyType? t) => t is null ? "" : t.Type
        + (t.InnerType is null ? "" : $"<{T(t.InnerType)}{(t.ValueType is null ? "" : "," + T(t.ValueType))}>")
        + (t.EnumName is null ? "" : $" [{t.EnumName}]") + (t.StructType is null ? "" : $" [{t.StructType}]");
    using var w = new StreamWriter(outFile);
    foreach (var (name, values) in m.Enums.OrderBy(e => e.Key, StringComparer.Ordinal))
        w.WriteLine($"enum {name}: " + string.Join(' ', values.OrderBy(v => v.Key).Select(v => $"{v.Key}={v.Value}")));
    foreach (var (name, st) in m.Types.OrderBy(e => e.Key, StringComparer.Ordinal))
    {
        w.WriteLine($"struct {name}{(st.SuperType is null ? "" : " : " + st.SuperType)}");
        foreach (var p in st.Properties.Values.OrderBy(p => p.Index)) w.WriteLine($"  {p.Name}: {T(p.MappingType)}");
    }
    Console.WriteLine($"{m.Enums.Count} enums, {m.Types.Count} structs -> {outFile}");
    return 0;
}

// Writes a package's name map ("N	<index>	<name>"), import map ("I	<-index>	<class>	<outer path>.<name>")
// and export map ("E	<index>	<name>	<serial offset in .uexp>	<serial size>"), for decoding raw export bytes by hand.
int Names(string path, string outFile)
{
    var pkg = (Package)provider.LoadPackage(path);
    using var w = new StreamWriter(outFile);
    for (var i = 0; i < pkg.NameMap.Length; i++) w.WriteLine($"N	{i}	{pkg.NameMap[i].Name}");
    for (var i = 0; i < pkg.ImportMap.Length; i++)
    {
        var im = pkg.ImportMap[i];
        var outer = im.OuterIndex.IsImport ? pkg.ImportMap[-im.OuterIndex.Index - 1].ObjectName.Text + "." : "";
        w.WriteLine($"I	{-(i + 1)}	{im.ClassName.Text}	{outer}{im.ObjectName.Text}");
    }
    for (var i = 0; i < pkg.ExportMap.Length; i++)
    {
        var ex = pkg.ExportMap[i];
        w.WriteLine($"E	{i + 1}	{ex.ObjectName.Text}	{ex.SerialOffset - pkg.Summary.TotalHeaderSize}	{ex.SerialSize}");
    }
    Console.WriteLine($"{pkg.NameMap.Length} names, {pkg.ImportMap.Length} imports, {pkg.ExportMap.Length} exports -> {outFile}");
    return 0;
}

// Reads only the unversioned-property header of one export and prints, per serialized property, its
// schema index and name as CUE4Parse's mappings resolve it (for checking a hand decode).
int Props(string path, string exportName)
{
    var pkg = (Package)provider.LoadPackage(path);
    var i = Array.FindIndex(pkg.ExportMap, e => e.ObjectName.Text == exportName);
    var ex = pkg.ExportMap[i];
    var uexp = provider.SaveAsset(Path.ChangeExtension(path, ".uexp"));
    var at = ex.SerialOffset - pkg.Summary.TotalHeaderSize;
    var ar = new CUE4Parse.UE4.Readers.FByteArchive("export", uexp[(int)at..]);
    var header = new CUE4Parse.UE4.Assets.Objects.Unversioned.FUnversionedHeader(ar);
    Console.WriteLine($"{exportName}: .uexp offset {at}, header {ar.Position} bytes");
    var obj = ((IPackage)pkg).GetExports().First(e => e.Name == exportName);
    var cls = obj.Class?.Load<CUE4Parse.UE4.Objects.UObject.UStruct>();
    var st = new SerializedStruct(provider.MappingsForGame, cls!);
    using var it = new CUE4Parse.UE4.Assets.Objects.Unversioned.FIterator(header);
    do
    {
        var (val, nonZero) = it.Current;
        Console.WriteLine($"  {val,4}  {(nonZero ? "value" : "zero ")}  {(st.TryGetValue(val, out var pi) ? pi.Name + ": " + pi.MappingType.Type : "?")}");
    } while (it.MoveNext());
    return 0;
}

// Serializes every export of each package to <outDir>/<game path without /Game/>.json.
int Dump(string outDir, string what)
{
    var paths = what.StartsWith('@') ? File.ReadAllLines(what[1..]).Select(l => l.Trim()).Where(l => l.Length > 0).ToList() : [what];
    var settings = new JsonSerializerSettings { Formatting = Formatting.Indented, ReferenceLoopHandling = ReferenceLoopHandling.Ignore };
    var failed = 0;
    foreach (var gp in paths)
    {
        var path = gp.StartsWith("/Game/", StringComparison.OrdinalIgnoreCase) ? ContentRoot + gp[6..] : gp.TrimStart('/');
        var rel = (gp.StartsWith("/Game/") ? gp[6..] : gp.TrimStart('/')) + ".json";
        var dst = Path.Combine(outDir, rel.Replace('/', Path.DirectorySeparatorChar));
        try
        {
            if (!provider.TryLoadPackage(path, out var pkg)) { Console.WriteLine($"FAIL {gp}: not found"); failed++; continue; }
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            File.WriteAllText(dst, JsonConvert.SerializeObject(pkg.GetExports(), settings));
            Console.WriteLine($"ok   {gp}");
        }
        catch (Exception ex) { Console.WriteLine($"FAIL {gp}: {ex.GetType().Name}: {ex.Message}"); failed++; }
    }
    Console.WriteLine($"{paths.Count - failed}/{paths.Count} packages dumped");
    return 0;
}

// Writes one mounted file's bytes, unmodified, to outFile.
int SaveRaw(string path, string outFile)
{
    File.WriteAllBytes(outFile, provider.SaveAsset(path));
    Console.WriteLine($"{path} -> {outFile} ({new FileInfo(outFile).Length} bytes)");
    return 0;
}

// Dumps a texture's mip chain and bulk-data flags, for diagnosing partial decodes.
int Inspect(string packagePath)
{
    foreach (var e in provider.LoadPackage(packagePath).GetExports())
    {
        if (e is not UTexture2D t) continue;
        Console.WriteLine($"{e.Name}: {t.Format}, {t.PlatformData.SizeX}x{t.PlatformData.SizeY}, first mip index {t.GetFirstMipIndex()}");
        for (var i = 0; i < t.PlatformData.Mips.Length; i++)
        {
            var m = t.PlatformData.Mips[i];
            var b = m.BulkData;
            Console.WriteLine($"  mip {i}: {m.SizeX}x{m.SizeY} flags {b?.Header.BulkDataFlags} elements {b?.Header.ElementCount} sizeOnDisk {b?.Header.SizeOnDisk} offset {b?.Header.OffsetInFile} data {b?.Data?.Length.ToString() ?? "null"}");
        }
        foreach (var p in t.Properties) Console.WriteLine($"  prop {p.Name} = {p.Tag?.GenericValue}");
    }
    return 0;
}

int Export(string outDir, string? prefix)
{
    Directory.CreateDirectory(outDir);
    // "@file" instead of a prefix: export exactly the package paths (/Game/...) listed in that file.
    var listed = prefix is not null && prefix.StartsWith('@')
        ? File.ReadAllLines(prefix[1..]).Select(l => l.Trim()).Where(l => l.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase)
        : null;
    var candidates = provider.Files.Values
        .Where(f => f.Extension.Equals("uasset", StringComparison.OrdinalIgnoreCase))
        .Where(f => prefix is null ? Selected(GamePath(f))
            : listed is not null ? listed.Contains(GamePath(f))
            : GamePath(f).StartsWith(prefix.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
        .OrderBy(f => f.Path, StringComparer.OrdinalIgnoreCase)
        .ToList();
    Console.WriteLine($"{candidates.Count} candidate packages");

    var manifest = new ConcurrentDictionary<string, (string Png, int W, int H, string Fmt)>(StringComparer.OrdinalIgnoreCase);
    var failures = new ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    var sprites = new ConcurrentBag<UPaperSprite>();
    var done = 0;

    // Decodes one texture and writes it as <outDir>/<game path without /Game/>.png.
    void ExportTexture(UTexture2D tex)
    {
        var assetPath = AssetPath(tex);
        if (manifest.ContainsKey(assetPath)) return;
        try
        {
            var c = tex.Decode();
            if (c is null) { failures[assetPath] = "decode returned no data (no mips with bulk data)"; return; }
            var png = c.Encode(ETextureFormat.Png, false, out _);
            var rel = (assetPath.StartsWith("/Game/") ? assetPath[6..] : assetPath.TrimStart('/')) + ".png";
            var dst = Path.Combine(outDir, rel.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            File.WriteAllBytes(dst, png);
            manifest[assetPath] = (rel, c.Width, c.Height, tex.Format.ToString());
        }
        catch (Exception ex) { failures[assetPath] = $"{ex.GetType().Name}: {ex.Message}"; }
    }

    Parallel.ForEach(candidates, new ParallelOptions { MaxDegreeOfParallelism = Math.Max(2, Environment.ProcessorCount / 2) }, f =>
    {
        try
        {
            if (!provider.TryLoadPackage(f, out var pkg)) { failures[GamePath(f)] = "package failed to load"; return; }
            foreach (var e in pkg.GetExports())
            {
                if (e is UTexture2D t) ExportTexture(t);
                else if (e is UPaperSprite s) sprites.Add(s);
            }
        }
        catch (Exception ex) { failures[GamePath(f)] = $"{ex.GetType().Name}: {ex.Message}"; }
        var n = Interlocked.Increment(ref done);
        if (n % 1000 == 0) Console.WriteLine($"  {n}/{candidates.Count} packages, {manifest.Count} PNGs, {failures.Count} failures, {sw.Elapsed:hh\\:mm\\:ss}");
    });

    // Atlases: export each sprite's baked source texture (even outside the selected folders),
    // then describe the sprite's rectangle in that atlas.
    var spriteRows = new List<object>();
    foreach (var s in sprites.OrderBy(s => s.GetPathName(), StringComparer.OrdinalIgnoreCase))
    {
        string? atlas = null;
        double x = 0, y = 0, w = 0, h = 0;
        var from = "none";
        try
        {
            if (s.BakedSourceTexture is { IsNull: false } idx && idx.TryLoad<UTexture2D>(out var atlasTex))
            {
                ExportTexture(atlasTex);
                atlas = AssetPath(atlasTex);
                if (s.BakedSourceDimension.X > 0 && s.BakedSourceDimension.Y > 0)
                {
                    (x, y, w, h) = (s.BakedSourceUV.X, s.BakedSourceUV.Y, s.BakedSourceDimension.X, s.BakedSourceDimension.Y);
                    from = "BakedSourceUV+BakedSourceDimension";
                }
                else if (s.BakedRenderData.Length > 0 && manifest.TryGetValue(atlas, out var m))
                {
                    var us = s.BakedRenderData.Select(v => v.Z).ToArray();
                    var vs = s.BakedRenderData.Select(v => v.W).ToArray();
                    (x, y) = (Math.Round(us.Min() * m.W, 2), Math.Round(vs.Min() * m.H, 2));
                    (w, h) = (Math.Round(us.Max() * m.W, 2) - x, Math.Round(vs.Max() * m.H, 2) - y);
                    from = "BakedRenderData UV bounds";
                }
            }
            else failures[AssetPath(s)] = "sprite has no loadable BakedSourceTexture";
        }
        catch (Exception ex) { failures[AssetPath(s)] = $"sprite: {ex.GetType().Name}: {ex.Message}"; }
        spriteRows.Add(new
        {
            name = s.Name,
            asset = AssetPath(s),
            atlas,
            atlasPng = atlas is not null && manifest.TryGetValue(atlas, out var am) ? am.Png : null,
            x, y, width = w, height = h,
            rectSource = from,
        });
    }
    File.WriteAllText(Path.Combine(outDir, "sprites.json"), JsonConvert.SerializeObject(spriteRows, Formatting.Indented));

    var csv = new StringBuilder("game_asset_path,png_path,width,height,pixel_format\n");
    foreach (var (k, v) in manifest.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase))
        csv.Append(CultureInfo.InvariantCulture, $"{Csv(k)},{Csv(v.Png)},{v.W},{v.H},{v.Fmt}\n");
    File.WriteAllText(Path.Combine(outDir, "manifest.csv"), csv.ToString());

    var fcsv = new StringBuilder("game_asset_path,reason\n");
    foreach (var (k, v) in failures.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase))
        fcsv.Append(CultureInfo.InvariantCulture, $"{Csv(k)},{Csv(v)}\n");
    File.WriteAllText(Path.Combine(outDir, "failures.csv"), fcsv.ToString());

    Console.WriteLine($"done: {candidates.Count} packages, {manifest.Count} PNGs, {spriteRows.Count} sprites, {failures.Count} failures, {sw.Elapsed:hh\\:mm\\:ss}");
    return 0;
}

static string Csv(string s) => s.Contains(',') || s.Contains('"') || s.Contains('\n') ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
