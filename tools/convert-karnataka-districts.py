"""Convert the user-supplied Karnataka District shapefile ZIP to a browser layer.

Install tools/requirements-karnataka-map.txt, then run:
  python tools/convert-karnataka-districts.py "C:/path/to/District (2).zip"

The source archive stays outside the deployed site. No boundaries or district
names are inferred from another dataset.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

import pyproj
import shapefile
import shapely
from shapely.geometry import mapping, shape
from shapely.ops import transform


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DESCRIPTION = "User-supplied District.shp"


def polygon_counts(geometry):
    polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
    return len(polygons), sum(len(polygon.interiors) for polygon in polygons)


def rounded_coordinates(value):
    if isinstance(value[0], (int, float)):
        return [round(number, 6) for number in value]
    return [rounded_coordinates(child) for child in value]


def convert(archive_path, output_path, provenance_path, tolerance):
    archive_bytes = archive_path.read_bytes()
    checksum = hashlib.sha256(archive_bytes).hexdigest()
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        members = {Path(name).name.lower(): name for name in archive.namelist()}

        def read_member(extension):
            return archive.read(members["district." + extension])

        source_crs = pyproj.CRS.from_wkt(read_member("prj").decode("utf-8"))
        if source_crs.to_epsg() != 32643:
            raise ValueError("Expected the supplied WGS 84 / UTM zone 43N source (EPSG:32643)")
        encoding = read_member("cpg").decode("ascii").strip()
        reader = shapefile.Reader(
            shp=io.BytesIO(read_member("shp")),
            shx=io.BytesIO(read_member("shx")),
            dbf=io.BytesIO(read_member("dbf")),
            encoding=encoding,
        )
        records = [record.as_dict() for record in reader.records()]
        geometries = [shape(item.__geo_interface__) for item in reader.shapes()]

    if len(records) != 31 or len(geometries) != 31:
        raise ValueError("Expected 31 supplied Karnataka district records and geometries")
    if len({record["KGISDist_1"] for record in records}) != 31:
        raise ValueError("District names must be unique")
    if not any(record["KGISDist_1"] == "Vijayanagara" and record["LGD_Distri"] == 738 for record in records):
        raise ValueError("The supplied Vijayanagara district (LGD 738) is missing")
    if len({record["LGD_Distri"] for record in records}) != 31:
        raise ValueError("District LGD codes must be unique")
    if not all(geometry.is_valid for geometry in geometries):
        raise ValueError("An input district geometry is invalid")

    # Simplify shared edges together in projected meters, retaining islands and
    # holes. The archive has tiny shared-edge precision mismatches, so validate
    # the result instead of assuming it forms a perfectly matched coverage.
    simplified = shapely.coverage_simplify(geometries, tolerance)
    for original, display in zip(geometries, simplified):
        if not display.is_valid or display.is_empty:
            raise ValueError("Simplification produced an invalid/empty district")
        if polygon_counts(original) != polygon_counts(display):
            raise ValueError("Simplification removed a polygon or hole")
        if abs(display.area - original.area) / original.area > 0.005:
            raise ValueError("Simplification changed a district area by more than 0.5%")
    source_overlap = max(0, sum(geometry.area for geometry in geometries) - shapely.union_all(geometries).area)
    display_overlap = max(0, sum(geometry.area for geometry in simplified) - shapely.union_all(simplified).area)
    if display_overlap > source_overlap + 100:
        raise ValueError("Simplification introduced more than 100 square meters of overlap")

    project = pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True).transform
    features = []
    for record, geometry in zip(records, simplified):
        projected = mapping(shapely.orient_polygons(transform(project, geometry)))
        geojson_geometry = {
            "type": projected["type"],
            "coordinates": rounded_coordinates(projected["coordinates"]),
        }
        display = shape(geojson_geometry)
        if not display.is_valid or display.is_empty:
            raise ValueError("Coordinate rounding produced an invalid/empty district")
        west, south, east, north = display.bounds
        if not (73 < west <= east < 80 and 10 < south <= north < 20):
            raise ValueError("Projected coordinates are outside Karnataka's expected longitude/latitude range")
        features.append({
            "type": "Feature",
            "properties": {
                "district": record["KGISDist_1"],
                "state": "Karnataka",
                "code": str(record["LGD_Distri"]),
                "kgis_code": record["KGISDistri"],
                "bhu_code": record["BhuCodeDis"],
                "source": SOURCE_DESCRIPTION,
            },
            "geometry": geojson_geometry,
        })

    result = {
        "type": "FeatureCollection",
        "properties": {
            "title": "Karnataka districts - display layer",
            "source": SOURCE_DESCRIPTION,
            "source_archive": archive_path.name,
            "source_sha256": checksum,
            "source_crs": "EPSG:32643",
            "simplification": "Shared-edge Visvalingam-Whyatt",
            "tolerance_m": tolerance,
            "note": "31 source districts; original names retained; simplified for visual graphics.",
        },
        "features": features,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    max_area_change = max(abs(display.area - original.area) / original.area for original, display in zip(geometries, simplified))
    summary = {
        "features": len(features),
        "input_vertices": int(shapely.count_coordinates(geometries)),
        "output_vertices": int(shapely.count_coordinates(simplified)),
        "output_bytes": output_path.stat().st_size,
        "max_district_area_change_percent": round(max_area_change * 100, 6),
        "source_overlap_m2": round(source_overlap, 3),
        "display_overlap_m2": round(display_overlap, 3),
    }
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    provenance_path.write_text(
        "Karnataka district display boundaries\n"
        f"Source: user-supplied {archive_path.name}, containing District.shp/.shx/.dbf/.prj/.cpg.\n"
        f"Archive SHA-256: {checksum}\n"
        "The archive does not identify its publisher, license, or boundary effective date.\n"
        "31 districts, including Vijayanagara (LGD 738); names are retained as supplied,\n"
        "including Bengaluru South, Bengaluru (Urban), Bengaluru (Rural), Kolara and Kalaburgi.\n"
        "Fields: district = KGISDist_1; code = LGD_Distri (string); kgis_code = KGISDistri;\n"
        "bhu_code = BhuCodeDis; state = Karnataka. No other source is used for boundaries.\n"
        "Source CRS: WGS 84 / UTM zone 43N (EPSG:32643). Output: WGS 84 longitude, latitude,\n"
        "six decimal places; pyproj transformation uses always_xy=True.\n"
        f"Shared-edge Visvalingam-Whyatt simplification in source meters, tolerance {tolerance:g} m\n"
        "(square-root triangle area parameter, not a maximum displacement). Islands/holes retained.\n"
        "Input has tiny shared-edge precision mismatches; individual source/output geometries\n"
        "are valid. Simplified area change per district stays below 0.5%; overlap increase\n"
        "stays below 100 square meters. This is a display asset, not a surveying boundary file.\n"
        f"Conversion summary: {json.dumps(summary, separators=(',', ':'))}\n"
        f"Tool versions: pyshp {shapefile.__version__}, Shapely {shapely.__version__}, pyproj {pyproj.__version__}.\n"
        "Rebuild: install tools/requirements-karnataka-map.txt; run\n"
        'python tools/convert-karnataka-districts.py "path/to/District (2).zip"\n',
        encoding="utf-8",
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/karnataka-districts-display.geojson")
    parser.add_argument("--provenance", type=Path, default=ROOT / "assets/karnataka-districts-sources.txt")
    parser.add_argument("--tolerance", type=float, default=300)
    args = parser.parse_args()
    if args.tolerance <= 0:
        parser.error("--tolerance must be positive")
    print(json.dumps(convert(args.archive, args.output, args.provenance, args.tolerance), indent=2))
