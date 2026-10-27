// DsaExport: read-only Texture2D / PaperSprite exporter for DragonSword Awakening.
//
//   (the newest *.usmap in <toolsDir>, if any, is used as the mappings file)
//   DsaExport probe  <gameDir> <toolsDir>
//   DsaExport export <gameDir> <toolsDir> <outDir> [gamePathPrefix]
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
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
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
var provider = new DefaultFileProvider(Path.Combine(gameDir, "DS", "Content", "Paks"), SearchOption.TopDirectoryOnly,
    new VersionContainer(EGame.GAME_DragonSwordAwakening), StringComparer.OrdinalIgnoreCase);
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
    var candidates = provider.Files.Values
        .Where(f => f.Extension.Equals("uasset", StringComparison.OrdinalIgnoreCase))
        .Where(f => prefix is null
            ? Selected(GamePath(f))
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
